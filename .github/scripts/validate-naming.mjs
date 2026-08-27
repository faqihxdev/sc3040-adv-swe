import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ALLOWED_TYPES = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "test",
  "chore",
];

const TYPE_PATTERN = ALLOWED_TYPES.join("|");

export const BRANCH_PATTERN = new RegExp(
  `^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/(?:${TYPE_PATTERN})-[a-z0-9]+(?:-[a-z0-9]+)*$`,
);

export const SUBJECT_PATTERN = new RegExp(
  `^(?:${TYPE_PATTERN}): \\S(?:.*\\S)?$`,
);

export function isValidBranchName(branchName) {
  return BRANCH_PATTERN.test(branchName);
}

export function isValidSubject(subject) {
  return SUBJECT_PATTERN.test(subject);
}

export function findBlockingErrors(branchName, pullRequestTitle) {
  const errors = [];

  if (!isValidBranchName(branchName)) {
    errors.push(
      `Invalid branch "${branchName}". Expected <name>/<type>-<lowercase-kebab-description>.`,
    );
  }

  if (!isValidSubject(pullRequestTitle)) {
    errors.push(
      `Invalid PR title "${pullRequestTitle}". Expected <type>: <message>.`,
    );
  }

  return errors;
}

export function findCommitWarnings(commits) {
  return commits
    .filter((commit) => !isValidSubject(commit.subject))
    .map(
      (commit) =>
        `Commit ${commit.sha.slice(0, 7)} has subject "${commit.subject}". Expected <type>: <message>.`,
    );
}

export function readNonMergeCommits(baseSha, headSha) {
  const output = execFileSync(
    "git",
    ["rev-list", "--reverse", "--no-merges", `${baseSha}..${headSha}`],
    { encoding: "utf8" },
  ).trim();

  if (!output) {
    return [];
  }

  return output.split(/\r?\n/).map((sha) => ({
    sha,
    subject: execFileSync("git", ["show", "-s", "--format=%s", sha], {
      encoding: "utf8",
    }).trimEnd(),
  }));
}

function readOptions(argumentsList) {
  const options = {};

  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(
        "Expected --branch, --title, --base, and --head arguments.",
      );
    }

    options[key.slice(2)] = value;
  }

  return options;
}

function main() {
  const options = readOptions(process.argv.slice(2));

  if (!options.branch || !options.title || !options.base || !options.head) {
    throw new Error(
      "Expected --branch, --title, --base, and --head arguments.",
    );
  }

  const commits = readNonMergeCommits(options.base, options.head);
  const warnings = findCommitWarnings(commits);
  const errors = findBlockingErrors(options.branch, options.title);

  if (warnings.length > 0) {
    console.warn("Commit naming warnings (advisory only):");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error("Naming convention check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Valid branch: ${options.branch}`);
  console.log(`Valid PR title: ${options.title}`);
  console.log(`Commit naming warnings: ${warnings.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
