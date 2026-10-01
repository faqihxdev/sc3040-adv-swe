import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('Docker operation failed: ' + args[0]);
  return r.stdout;
}
// Docker Desktop can publish ports on all interfaces even with a loopback
// bridge default. Recreate only this project's published containers, retaining
// their volumes/configuration, with explicit loopback bindings.
export async function enforceLoopback() {
  const endpoint = JSON.parse(docker(['context', 'inspect']))[0].Endpoints.docker.Host;
  const socketPath = endpoint.startsWith('npipe://')
    ? endpoint.slice(8).replaceAll('/', '\\')
    : endpoint.startsWith('unix://')
      ? endpoint.slice(7)
      : null;
  if (!socketPath) throw new Error('Use a local Docker socket for development.');
  const call = (method, path, data, binary = false) =>
    new Promise((resolve, reject) => {
      const body = data ? (Buffer.isBuffer(data) ? data : JSON.stringify(data)) : undefined;
      const req = request(
        {
          socketPath,
          method,
          path,
          headers: body
            ? {
                'Content-Type': Buffer.isBuffer(data) ? 'application/x-tar' : 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {},
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const bytes = Buffer.concat(chunks);
            if (res.statusCode >= 300)
              return reject(
                new Error('Docker API failed (' + res.statusCode + '). No volumes were removed.'),
              );
            resolve(binary ? bytes : bytes.length ? JSON.parse(bytes.toString()) : {});
          });
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  const names = docker(['ps', '--filter', 'name=supabase_', '--format', '{{.Names}}'])
    .trim()
    .split('\n')
    .filter((n) => /^supabase_[a-z_]+_useeatnow$/.test(n));
  for (const name of names) {
    const data = JSON.parse(docker(['inspect', name]))[0];
    const bindings = data.HostConfig.PortBindings ?? {};
    if (
      !Object.values(data.NetworkSettings.Ports ?? {})
        .flat()
        .some((p) => p && p.HostIp !== '127.0.0.1')
    )
      continue;
    if (!data.NetworkSettings.Networks['useeatnow-local'])
      throw new Error('Unexpected network for ' + name);
    for (const values of Object.values(bindings))
      for (const value of values ?? []) value.HostIp = '127.0.0.1';
    const host = { ...data.HostConfig, PortBindings: bindings, NetworkMode: 'useeatnow-local' };
    // Include anonymous volumes explicitly too; docker rm deliberately has no -v.
    host.Binds = [...(host.Binds ?? [])];
    for (const mount of data.Mounts) {
      if (mount.Type === 'volume' && !host.Binds.some((s) => s.split(':')[1] === mount.Destination))
        host.Binds.push(mount.Name + ':' + mount.Destination + (mount.RW ? '' : ':ro'));
    }
    const networking = {
      EndpointsConfig: {
        'useeatnow-local': {
          Aliases: data.NetworkSettings.Networks['useeatnow-local'].Aliases ?? [],
        },
      },
    };
    // The CLI injects gateway certificates and routing YAML into the writable
    // layer, not a volume. Preserve them in memory; never write secrets to disk.
    const gateway =
      name === 'supabase_kong_useeatnow'
        ? await call('GET', '/containers/' + data.Id + '/archive?path=/home/kong', undefined, true)
        : null;
    await call('POST', '/containers/' + data.Id + '/stop?t=15');
    await call('DELETE', '/containers/' + data.Id);
    await call('POST', '/containers/create?name=' + encodeURIComponent(name), {
      ...data.Config,
      HostConfig: host,
      NetworkingConfig: networking,
    });
    if (gateway)
      await call('PUT', '/containers/' + encodeURIComponent(name) + '/archive?path=/home', gateway);
    await call('POST', '/containers/' + encodeURIComponent(name) + '/start');
    console.log('Loopback-only ports: ' + name);
  }
  const checks = names.length ? JSON.parse(docker(['inspect', ...names])) : [];
  if (
    checks.some((c) =>
      Object.values(c.NetworkSettings.Ports ?? {})
        .flat()
        .some((p) => p && p.HostIp !== '127.0.0.1'),
    )
  )
    throw new Error('A development port is not loopback-only.');
  const deadline = Date.now() + 60000;
  while (names.length) {
    const state = JSON.parse(docker(['inspect', ...names]));
    if (
      state.every(
        (c) => c.State.Running && (!c.State.Health || c.State.Health.Status === 'healthy'),
      )
    )
      break;
    if (Date.now() > deadline)
      throw new Error('Local services are still starting. Run pnpm db:start again.');
    await delay(1000);
  }
}
if (process.argv.includes('--run')) await enforceLoopback();
