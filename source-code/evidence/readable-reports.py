"""Create a searchable presentation view without changing retained source records."""
from pathlib import Path
from html import escape
from collections import defaultdict
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
)

APP = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else APP / 'reports/readable'
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path('C:/Windows/Fonts')
for name, file in [('Body', 'arial.ttf'), ('Bold', 'arialbd.ttf')]:
    if (FONT / file).exists():
        pdfmetrics.registerFont(TTFont(name, str(FONT / file)))
    else:
        pdfmetrics.registerFont(pdfmetrics.Font(name, 'Helvetica-Bold' if name == 'Bold' else 'Helvetica', 'WinAnsiEncoding'))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Bold')
INK, MUTED = colors.HexColor('#17212b'), colors.HexColor('#536170')
ACCENT, PALE = colors.HexColor('#174d6b'), colors.HexColor('#f2f5f7')
styles = {
    'title': ParagraphStyle('title', fontName='Bold', fontSize=25, leading=30, textColor=INK, spaceAfter=16),
    'heading': ParagraphStyle('heading', fontName='Bold', fontSize=16, leading=21, textColor=INK, spaceBefore=12, spaceAfter=9),
    'body': ParagraphStyle('body', fontName='Body', fontSize=10.5, leading=15, textColor=INK, spaceAfter=8),
    'small': ParagraphStyle('small', fontName='Body', fontSize=8.8, leading=12.3, textColor=MUTED, spaceAfter=6),
    'cell': ParagraphStyle('cell', fontName='Body', fontSize=9.3, leading=12.7, textColor=INK),
    'head': ParagraphStyle('head', fontName='Bold', fontSize=9.3, leading=12.7, textColor=ACCENT),
}
RECORDS = {
    'unit.xml': '1m1x0RyRkqg81hYNM2gZKW0z2YrR5BMVg',
    'browser.xml': '18BsqAEbe_bGkRIVK_IoHdhCuu8rxaE9r',
    'database.txt': '1tRLcmHt1XMJ-3KBaOeyZM_KNS7uAue16',
    'coverage-summary.json': '1pxZRqeOlJj2KOjMNkMfaqSb7NbmETlPR',
    'calculations.xml': '1-oGLEClVbDxQisUnNndCtsE6vmerKghY',
    'live-ai.json': '1m1Ie6h2DKKAd9DSmsfV9a5Qjfg19U1hG',
    'review.json': '1S3dMi0mNNqLhW2_AD7KAJxbvImoq_AbQ',
    'restore-with-reservation.json': '1YRFfrw_UtNnHSA8AQEv1hjmzKZnYGuj7',
}
story, manifest = [], {'sections': [], 'sources': []}


def p(text, style='body'):
    return Paragraph(escape(str(text)).replace('\n', '<br/>'), styles[style])


def add(text, style='body'):
    story.append(p(text, style))


def source(relative, cloud_name=None):
    path = APP / relative
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest['sources'].append({'path': relative, 'sha256': digest})
    add('Source: ' + relative, 'small')
    if cloud_name in RECORDS:
        url = 'https://drive.google.com/file/d/' + RECORDS[cloud_name] + '/view'
        story.append(Paragraph(f'<link href="{url}" color="#174d6b"><u>Original {escape(cloud_name)}</u></link>', styles['small']))


def section(key, title):
    if story:
        story.append(PageBreak())
    heading = p(title, 'title')
    heading.section_key = key
    story.append(heading)


def table(headers, rows, widths):
    data = [[p(x, 'head') for x in headers]] + [[p(x, 'cell') for x in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, 0), PALE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafb')]),
        ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))


def read_json(relative):
    return json.loads((APP / relative).read_text(encoding='utf-8'))


def case_status(case):
    if case.find('failure') is not None or case.find('error') is not None:
        return 'Failed'
    return 'Skipped' if case.find('skipped') is not None else 'Passed'


unit = ET.parse(APP / 'reports/unit.xml').getroot()
browser = ET.parse(APP / 'reports/browser.xml').getroot()
supplement = ET.parse(APP / 'reports/lab5-evidence/calculations.xml').getroot()
raw = read_json('reports/lab5-evidence/live-ai.json')
review = read_json('evidence/review.json')
restore = read_json('reports/lab5-evidence/restore-with-reservation.json')
coverage = read_json('coverage/coverage-summary.json')
assert len(list(unit.iter('testcase'))) == 218
assert len(list(browser.iter('testcase'))) == 184
assert hashlib.sha256((APP / 'reports/lab5-evidence/live-ai.json').read_bytes()).hexdigest() == review['sourceRecord']['sha256']

section('summary', 'Test results and source records')
add('UseEatNow', 'heading')
add('Readable tables from retained XML, JSON and SQL output. Test names, timings and outcomes come from the original records. The original files remain available through their source links.')
table(['Recorded check', 'Result', 'Scope'], [
    ['Unit tests', '218 passed', 'Domain and service assertions'],
    ['Database tests', '5 suites passed', 'Real local PostgreSQL, transactional checks'],
    ['Browser cases', '184 passed', 'Chromium and Firefox, mobile and desktop widths'],
    ['Supplementary checks', '6 passed', 'Four calculations and two Auth configurations'],
    ['Recipe quality review', '9/10 scenarios passed', 'First retained run of each scenario'],
    ['Recipe-ready timing', '18/20 within 45 s', 'Two empty results count as failures'],
    ['Active-hold restore', 'Passed in 3.621 s', 'Separate local database, ten matching table fingerprints'],
], [130, 133, 248])
add('Automated checks use controlled provider responses and local databases. The recipe evaluation uses actual provider requests. Semantic findings and final release acceptance remain separate.', 'small')
add('Sections', 'heading')
add('Unit assertions\nBrowser assertions and four-configuration matrix\nDatabase suites and measured coverage\nSupplementary calculations and session checks\nRecipe quality review and timings\nRecovery and reservation recording')

section('unit', 'Unit assertions')
add('218 passed, no failed or skipped cases. Source test names are retained, including any historical naming conventions.')
source('reports/unit.xml', 'unit.xml')
for suite in unit.findall('testsuite'):
    add(suite.attrib['name'], 'heading')
    table(['Assertion', 'Result', 'Seconds'], [
        [c.attrib['name'], case_status(c), f"{float(c.attrib.get('time', 0)):.4f}"]
        for c in suite.findall('testcase')
    ], [395, 58, 58])

section('browser', 'Browser workflow assertions')
add('184 passing executions. Each row below groups the same test across the four recorded browser configurations.')
source('reports/browser.xml', 'browser.xml')
groups = defaultdict(dict)
for suite in browser.findall('testsuite'):
    for case in suite.findall('testcase'):
        groups[(suite.attrib['name'], case.attrib['name'])][suite.attrib['hostname']] = case
projects = ['ChromiumMobile360', 'ChromiumDesktop1366', 'FirefoxMobile360', 'FirefoxDesktop1366']
add('Column key: C360 = Chromium 360x800; C1366 = Chromium 1366x768; F360 = Firefox 360x800; F1366 = Firefox 1366x768. Firefox at 360 pixels is a narrow viewport, not mobile emulation.', 'small')
for file in dict.fromkeys(key[0] for key in groups):
    add(file, 'heading')
    rows = []
    for (name, title), runs in groups.items():
        if name != file:
            continue
        rows.append([title] + [
            (case_status(runs[project]) + f"\n{float(runs[project].attrib.get('time', 0)):.2f} s")
            if project in runs else 'Not recorded' for project in projects
        ])
    table(['Workflow assertion', 'C360', 'C1366', 'F360', 'F1366'], rows, [283, 57, 57, 57, 57])

section('database', 'Database suites and coverage')
source('reports/database.txt', 'database.txt')
notices = []
for line in (APP / 'reports/database.txt').read_text(encoding='utf-8').splitlines():
    if 'PASS:' in line:
        notices.append(line.split('PASS:', 1)[1].strip())
assert len(notices) == 5
table(['SQL suite', 'Recorded assertions'], list(zip([
    'Core database', 'Photo batch', 'Demo reset apparatus', 'Meal image cache', 'Cooking reservations'
], notices)), [135, 376])
add('Measured coverage', 'heading')
add('Scope: configured domain modules and meal-ticket code. These percentages do not describe the whole application.')
source('coverage/coverage-summary.json', 'coverage-summary.json')
rows = []
for file, value in coverage.items():
    label = 'Configured total' if file == 'total' else file.replace('\\', '/').split('/src/')[-1]
    rows.append([label] + [str(value[k]['pct']) + '%' for k in ['statements', 'branches', 'functions', 'lines']])
table(['Module', 'Statements', 'Branches', 'Functions', 'Lines'], rows, [239, 68, 68, 68, 68])

section('supplementary', 'Calculation and session checks')
add('Six supplementary assertions. They are separate from the 218-test unit baseline.')
source('reports/lab5-evidence/calculations.xml', 'calculations.xml')
table(['Retained assertion', 'Result'], [[c.attrib['name'], case_status(c)] for c in supplement.iter('testcase')], [438, 73])
table(['Worked input', 'Expected result'], [
    ['Expiry points: 3, 2 and 1. Recipe uses the first and third.', '4/6 = 66.6667%'],
    ['500 g stock, 100 g used and 25 g discarded.', '375 g left'],
    ['25 g discarded from 125 g removed; 50 ml from 250 ml.', '20% per unit, separately'],
    ['Use confirmed on expiry days 0, 3 and 4.', 'Days 0 and 3 included; day 4 excluded'],
    ['Sign out one session globally; renew the second.', 'Second refresh fails'],
    ['Sign out one session locally; renew the second.', 'Second refresh succeeds'],
], [345, 166])

section('quality', 'Recipe quality evaluation')
add('QA reviewer: ' + review['reviewer'] + '. Review status: ' + review['reviewStatus'] + '.')
add('Sample: ten scenarios, first retained repetition of each. Nine scenarios meet the rubric; Vegetarian fails. Preparation-liquid findings remain open.')
source('evidence/review.json', 'review.json')
add('Rubric dimensions: ingredient/method consistency, proportions, actionable instructions and request fit. Each dimension scores 0 to 2. A scenario needs at least one usable meal, zero hard-check violations and a mean total of at least 6/8, with no zero for consistency.', 'small')
for c in review['cases']:
    run = next(r for r in raw['runs'] if r['scenario'] == c['scenario'] and r['repetition'] == 1)
    add(c['scenario'] + '  ' + run['title'], 'heading')
    scores = c['mealScores']
    add(('Passed' if c['pass'] else 'Failed') + '. ' + c['note'])
    if scores:
        table(['Displayed recipe', 'Consistency', 'Proportions', 'Instructions', 'Request fit', 'Total'], [
            [run['displayedMeals'][i]['name']] + [str(n) for n in score] + [str(sum(score)) + '/8']
            for i, score in enumerate(scores)
        ], [211, 60, 60, 60, 60, 60])
    else:
        add(run.get('message', 'No recipes displayed.'), 'small')

section('timing', 'Recipe-ready timing')
add('Target: 45 seconds. Eighteen of twenty requests displayed recipes within the target. The two no-recipe responses count as failures. Timing ends when the first recipe heading appears; image timing is separate.')
add('Environment: local app, real provider, Chromium, recorded model and configuration. Hosted response time is a separate check.', 'small')
source('reports/lab5-evidence/live-ai.json', 'live-ai.json')
table(['Trial', 'Scenario', 'Repeat', 'Seconds', 'Recipes', 'Within 45 s'], [
    [str(r['trial']), r['scenario'], str(r['repetition']), f"{r['seconds']:.3f}", str(r['recipesDisplayed']),
     'Passed' if r['recipesDisplayed'] > 0 and r['seconds'] <= 45 else 'Failed'] for r in raw['runs']
], [46, 78, 64, 94, 80, 149])
add('The readable assessment derives its pass/fail values from the recorded seconds and displayed-recipe count. Source measurements and checksums are unchanged.', 'small')

section('recovery', 'Recovery with an active reservation')
source('reports/lab5-evidence/restore-with-reservation.json', 'restore-with-reservation.json')
table(['Recorded field', 'Value'], [
    ['Result', restore['result']], ['Restore duration', str(restore['durationSeconds']) + ' seconds'],
    ['Recorded fixture stock', str(restore['fixture']['recordedGrams']) + ' g'],
    ['Active fixture hold', str(restore['fixture']['heldGrams']) + ' g'],
    ['Restored cooking sessions', str(restore['checks']['cookingSessions'])],
    ['Restored reservations', str(restore['checks']['ingredientReservations'])],
    ['Public tables with RLS', str(restore['checks']['rls'])],
    ['Matching table fingerprints', str(len(restore['checks']['dataFingerprints']))],
], [286, 225])
add(restore['scope'])
add('All listed table fingerprints matched between source and destination. The drill used a separate local destination database. The source database remained untouched.', 'small')
table(['Table', 'Fingerprint comparison'], [[name, 'Matched'] for name in restore['checks']['dataFingerprints']], [286, 225])

section('recording', 'Recorded reservation workflow')
record_root = APP / 'reports/presentation-recording/accepted'
accepted = list(record_root.glob('*/recording.json'))
if accepted:
    record = json.loads(accepted[0].read_text(encoding='utf-8'))
    add('Case: ' + record['case'] + '. Result: ' + record['result'] + '.')
    add(record['scope'])
    table(['Visible action', 'Checked result'], [
        ['Cook this', '100 g held. Recorded stock stays at 500 g.'],
        ['Open Inventory', '100 g reserved, 400 g available.'],
        ['Reload and open Cook', 'The persisted cooking session resumes.'],
        ['End session', 'Hold released, no outcome recorded, stock remains 500 g.'],
    ], [160, 351])
    add('This is a separate presentation recording, not an additional case counted in the 184-execution baseline. A pointer ring marks actual automated pointer events. Leading sign-in/setup is trimmed; the retained action sequence runs at original speed.', 'small')
    source(str(accepted[0].relative_to(APP)).replace('\\', '/'))
    image_path = accepted[0].parent / 'reserved-stock.png'
    from reportlab.platypus import Image
    story.append(Image(str(image_path), width=511, height=511 * 768 / 1366))


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.setFont('Bold', 9)
    canvas.drawString(42, 803, 'UseEatNow / Test results')
    canvas.setFillColor(MUTED)
    canvas.setFont('Body', 8)
    canvas.drawRightString(553, 803, 'Retained source records')
    canvas.drawString(42, 29, 'Readable results. Original measurements preserved.')
    canvas.drawRightString(553, 29, str(doc.page))
    canvas.restoreState()


class Report(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'section_key'):
            self.canv.bookmarkPage(flowable.section_key)
            self.canv.addOutlineEntry(flowable.getPlainText(), flowable.section_key, 0)
            manifest['sections'].append({'id': flowable.section_key, 'title': flowable.getPlainText(), 'page': self.page})


path = OUT / '07-Readable-test-results.pdf'
doc = Report(str(path), pagesize=(595.28, 841.89), leftMargin=42, rightMargin=42,
             topMargin=62, bottomMargin=55, title='UseEatNow: test results and source records', author='UseEatNow Team 4')
doc.addPageTemplates(PageTemplate(id='report', frames=[Frame(42, 55, 511, 725, leftPadding=0,
    rightPadding=0, topPadding=0, bottomPadding=0)], onPage=draw_page))
doc.build(story)
manifest['output'] = path.name
manifest['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
(OUT / 'readable-results-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'file': str(path), 'sections': manifest['sections']}, indent=2))
