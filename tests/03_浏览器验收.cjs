'use strict';

// 用法：node tests/03_浏览器验收.cjs [可选证据目录]
// CT_PLAYWRIGHT_PATH 指向已安装的 Playwright 包，省略时使用本项目依赖。
// CT_BROWSER_CHANNEL 为 chromium（默认）或 msedge，指定的浏览器须已安装。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.CT_PLAYWRIGHT_PATH || 'playwright');

const docs = path.resolve(__dirname, '..', 'docs');
const mount = '/ct-contrast-test/';
const evidence = process.argv[2] ? path.resolve(process.argv[2]) : null;
const channel = process.env.CT_BROWSER_CHANNEL || 'chromium';
const results = [];
const network = { posts: [], apiRequests: [], failedResources: [] };
const pageErrors = [];

function startServer() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!['GET', 'HEAD'].includes(request.method) || !pathname.startsWith(mount)) {
      response.writeHead(404).end();
      return;
    }
    const file = path.resolve(docs, pathname.slice(mount.length) || 'index.html');
    const relative = path.relative(docs, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      response.writeHead(404).end();
      return;
    }
    fs.readFile(file, (error, content) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}${mount}` });
    });
  });
}

async function expectText(page, id, text) {
  await page.waitForFunction(({ id, text }) =>
    document.getElementById(id).textContent.includes(text), { id, text });
}

async function expectStep(page, step) {
  await expectText(page, 'progressText', `第 ${step} / 6 步`);
  assert.equal(await page.locator('.step-panel:visible').count(), 1);
  assert.equal(await page.locator('.step-panel:visible').getAttribute('data-step'), String(step));
}

async function frame(page) {
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function report(page, name, metrics) {
  await page.locator('#report').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#agentName').textContent()).trim(), name);
  const values = await page.locator('#metrics .v').allTextContents();
  assert.deepEqual(values.map(value => value.replace(/\s/g, '')), metrics);
  assert.equal(await page.locator('#wizard').isVisible(), false);
  assert.equal(await page.locator('#risks .risk-row').count(), 5);
  assert.ok(await page.locator('#chain li').count() > 0);
}

async function capture(page, name) {
  if (evidence) await page.screenshot({ path: path.join(evidence, name), fullPage: true });
}

async function fillBasic(page) {
  await page.locator('#age').fill('45');
  await page.locator('label:has(input[name="sex"][value="female"])').click();
  await page.locator('#height').fill('165');
  await page.locator('#weight').fill('60');
  await expectText(page, 'outBmi', '22.0 kg/m²');
}

async function fillManual(page, exam, maxflow = '') {
  await fillBasic(page);
  await page.locator('#btnNext').click();
  await expectStep(page, 2);
  await page.locator('#exam').selectOption(exam);
  if (maxflow) await page.locator('#maxflow').fill(maxflow);
  await page.locator('#btnNext').click();
  await expectStep(page, 3);
  await page.locator('#scr').fill('70');
  await expectText(page, 'outEgfr', '94 mL/min/1.73m²');
  for (const step of [4, 5, 6]) {
    await page.locator('#btnNext').click();
    await expectStep(page, step);
  }
  await page.locator('#gauge').selectOption('18');
  await page.locator('#site').selectOption('antecubital');
  await page.locator('#btnNext').click();
}

async function homepage(page, url) {
  const assets = [];
  page.on('response', response => {
    if (['stylesheet', 'script'].includes(response.request().resourceType())) {
      assets.push({ url: response.url(), status: response.status() });
    }
  });
  await page.goto(url);
  await expectStep(page, 1);
  await expectText(page, 'outBmi', '待填写');
  assert.equal(await page.title(), 'CT 对比剂智能选择系统 · 分步评估');
  assert.equal(await page.evaluate(() => typeof CTContrast.evaluate), 'function');
  assert.equal(await page.evaluate(() => typeof CTContrast.preview), 'function');
  for (const name of ['2_样式.css', '3_交互.js', '4_算法.js']) {
    const asset = assets.find(item => decodeURI(item.url).endsWith('/' + name));
    assert.ok(asset, `项目子路径下加载 ${name}`);
    assert.equal(asset.status, 200);
    assert.ok(asset.url.startsWith(url));
  }
  assert.ok(await page.locator('#btnNext').evaluate(element =>
    getComputedStyle(element).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  await capture(page, '01_首页.png');
  return { resources: assets.length, mount };
}

async function requiredAndAbdomen(page, url) {
  await page.goto(url);
  await page.locator('#btnNext').click();
  await expectStep(page, 1);
  assert.ok(await page.locator('.field-msg:visible').count() >= 4);
  await fillBasic(page);
  await page.locator('#btnNext').click();
  await expectStep(page, 2);
  await page.locator('#btnNext').click();
  await expectStep(page, 2);
  assert.ok(await page.locator('.field-msg:visible').count() > 0);
  await page.locator('#exam').selectOption('abdomen');
  await page.locator('#btnNext').click();
  await expectStep(page, 3);
  await page.locator('#scr').fill('70');
  await expectText(page, 'outEgfr', '94 mL/min/1.73m²');
  for (const step of [4, 5, 6]) {
    await page.locator('#btnNext').click();
    await expectStep(page, step);
  }
  await page.locator('#btnNext').click();
  await expectStep(page, 6);
  assert.ok(await page.locator('.field-msg:visible').count() > 0);
  await page.locator('#gauge').selectOption('18');
  await page.locator('#site').selectOption('antecubital');
  await page.locator('#btnNext').click();
  await report(page, '碘海醇 350', ['78.6mL', '3.1mL/s', '25s', '27.5gI', '1.1gI/s', '25mL']);
  await capture(page, '02_手填腹部碘海醇350.png');
  return { agent: '碘海醇 350', volume: 78.6, flow: 3.1 };
}

async function demoAndPrint(page, url) {
  await page.goto(url);
  await page.locator('#btnDemo').click();
  await report(page, '碘克沙醇 320', ['55.9mL', '4.0mL/s', '14s', '17.9gI', '1.3gI/s', '25mL']);
  await expectText(page, 'verdictTag', '谨慎使用');
  await page.locator('#btnPrint').click();
  await page.locator('#btnPrint2').click();
  assert.equal(await page.evaluate(() => window.printCount), 2);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#report').isVisible(), true);
  assert.equal(await page.locator('.topbar').isVisible(), false);
  assert.equal(await page.locator('#btnBack').isVisible(), false);
  await page.emulateMedia({ media: 'screen' });
  await capture(page, '03_内置碘克沙醇320.png');
  if (evidence) await page.pdf({ path: path.join(evidence, '04_报告打印.pdf'), format: 'A4', printBackground: true });
  return { agent: '碘克沙醇 320', printCalls: 2 };
}

async function coronary400(page, url) {
  await page.goto(url);
  await fillManual(page, 'coronary', '3.7');
  await report(page, '碘美普尔 400', ['44.4mL', '3.7mL/s', '12s', '17.8gI', '1.5gI/s', '30mL']);
  await expectText(page, 'chain', '400 mgI/mL');
  await capture(page, '05_冠脉碘美普尔400.png');
  return { agent: '碘美普尔 400', volume: 44.4, flow: 3.7 };
}

async function modifyAndReset(page, url) {
  await page.goto(url + '#demo');
  await page.locator('#report').waitFor({ state: 'visible' });
  await page.locator('#btnBack').click();
  await expectStep(page, 6);
  await page.locator('#gauge').selectOption('picc');
  await page.locator('#btnNext').click();
  await report(page, '碘克沙醇 320', ['26.4mL', '2.2mL/s', '12s', '8.4gI', '0.7gI/s', '25mL']);
  await expectText(page, 'flags', '当前通路无法满足目标碘流率');
  await page.locator('#btnReset').click();
  await expectStep(page, 1);
  assert.equal(await page.locator('#age').inputValue(), '');
  assert.equal(await page.locator('#gauge').inputValue(), '');
  assert.equal(await page.locator('#report').isVisible(), false);
  assert.equal(await page.locator('#btnPrint').isVisible(), false);
  await expectText(page, 'outBmi', '待填写');
  return { modifiedVolume: 26.4, resetStep: 1 };
}

async function mobile(page, url) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url + '#demo');
  await page.reload();
  await page.locator('#report').waitFor({ state: 'visible' });
  await expectText(page, 'agentName', '碘克沙醇 320');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await capture(page, '06_移动390示例直达.png');
  return { width: 390, demoLink: true, horizontalOverflow: false };
}

// 包装正式方法，通过可控 Promise 检查时序，计算仍由原方法完成。
async function previewOrder(page, url) {
  await page.goto(url);
  await page.evaluate(() => {
    const original = CTContrast.preview;
    window.previewCalls = [];
    CTContrast.preview = fields => {
      window.previewCalls.push({ ...fields });
      const value = original(fields);
      if (fields.weight === '60') {
        return new Promise(resolve => {
          window.releasePreview = () => resolve(value);
        });
      }
      return value;
    };
  });
  await page.locator('#age').fill('45');
  await page.locator('label:has(input[name="sex"][value="female"])').click();
  await page.locator('#height').fill('165');
  await page.locator('#weight').fill('60');
  await page.waitForFunction(() => typeof window.releasePreview === 'function');
  await page.locator('#weight').fill('82');
  await expectText(page, 'outBmi', '30.1 kg/m²');
  await page.evaluate(() => window.releasePreview());
  await frame(page);
  assert.equal(await page.locator('#outBmi').textContent(), '30.1 kg/m²');
  await page.locator('#pName').fill('合成演示');
  await page.locator('#weight').dispatchEvent('change');
  await frame(page);
  const calls = await page.evaluate(() => window.previewCalls);
  assert.equal(calls.filter(fields => fields.weight === '82').length, 1);
  assert.equal(calls.some(fields => Object.hasOwn(fields, 'pName')), false);
  await capture(page, '07_旧预览返回保留新输入.png');
  return { latestBmi: '30.1', repeatedSnapshotCalls: 1 };
}

async function duplicateAndReset(page, url) {
  await page.goto(url);
  await page.evaluate(() => {
    const original = CTContrast.evaluate;
    window.evaluateCalls = [];
    CTContrast.evaluate = fields => {
      window.evaluateCalls.push({ ...fields });
      const value = original(fields);
      if (window.evaluateCalls.length === 1) {
        return new Promise(resolve => {
          window.releaseCalculation = () => resolve(value);
        });
      }
      return value;
    };
  });
  await page.locator('#btnDemo').click();
  await page.waitForFunction(() => typeof window.releaseCalculation === 'function');
  assert.equal(await page.locator('#btnNext').isDisabled(), true);
  assert.equal(await page.locator('#btnDemo').isDisabled(), true);
  await page.locator('#btnDemo').dispatchEvent('click');
  await page.locator('#btnDemo').dispatchEvent('click');
  await page.locator('#btnNext').dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.evaluateCalls.length), 1);
  await page.locator('#btnReset').click();
  await expectStep(page, 1);
  await page.evaluate(() => window.releaseCalculation());
  await frame(page);
  assert.equal(await page.locator('#report').isVisible(), false);
  assert.equal(await page.locator('#age').inputValue(), '');
  assert.equal(await page.locator('#btnDemo').isEnabled(), true);
  await page.locator('#btnDemo').click();
  await expectText(page, 'agentName', '碘克沙醇 320');
  await page.locator('#report').waitFor({ state: 'visible' });
  const calls = await page.evaluate(() => window.evaluateCalls);
  assert.equal(calls.length, 2);
  assert.equal(calls.some(fields => Object.hasOwn(fields, 'pName')), false);
  return { pendingCalls: 1, callsAfterNewCalculation: 2, staleReportVisible: false };
}

async function errorRecovery(page, url) {
  await page.goto(url);
  await page.evaluate(() => {
    const original = CTContrast.evaluate;
    window.evaluateCalls = [];
    CTContrast.evaluate = fields => {
      window.evaluateCalls.push({ ...fields });
      if (window.evaluateCalls.length === 1) throw new Error('合成测试计算失败');
      return original(fields);
    };
  });
  await page.locator('#btnDemo').click();
  await page.locator('#calculationError').waitFor({ state: 'visible' });
  await expectText(page, 'calculationError', '暂时无法计算，请核对输入后重试。');
  assert.equal(await page.locator('#report').isVisible(), false);
  assert.equal(await page.locator('#age').inputValue(), '74');
  assert.equal(await page.locator('#btnDemo').isEnabled(), true);
  assert.equal(await page.locator('#btnNext').isEnabled(), true);
  await capture(page, '08_计算失败提示.png');
  await page.locator('#btnDemo').click();
  await report(page, '碘克沙醇 320', ['55.9mL', '4.0mL/s', '14s', '17.9gI', '1.3gI/s', '25mL']);
  assert.equal(await page.locator('#calculationError').isVisible(), false);
  assert.equal(await page.evaluate(() => window.evaluateCalls.length), 2);
  await capture(page, '09_计算恢复.png');
  return { firstCalculationFailed: true, recoveredVolume: 55.9, calls: 2 };
}

async function main() {
  assert.ok(['chromium', 'msedge'].includes(channel), 'CT_BROWSER_CHANNEL 须为 chromium 或 msedge');
  assert.ok(process.argv.length <= 3, '仅接受一个可选参数，即证据输出目录');
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true });
    const scenarios = [
      ['首页和项目子路径资源', homepage],
      ['必填校验与六步手填腹部方案', requiredAndAbdomen],
      ['内置示例和两个打印入口', demoAndPrint],
      ['冠脉流率上限与碘美普尔400', coronary400],
      ['返回修改PICC和重置', modifyAndReset],
      ['移动390和示例直达链接', mobile],
      ['预览去重和过滤过期响应', previewOrder],
      ['重复提交和重置过滤旧计算', duplicateAndReset],
      ['计算失败提示与再次生成', errorRecovery],
    ];
    for (const [name, scenario] of scenarios) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('request', request => {
        if (request.method() === 'POST') network.posts.push(request.url());
        if (new URL(request.url()).pathname.includes('/api/')) network.apiRequests.push(request.url());
      });
      page.on('response', response => {
        if (response.status() >= 400) network.failedResources.push(response.url());
      });
      page.on('requestfailed', request => network.failedResources.push(request.url()));
      await page.addInitScript(() => {
        window.printCount = 0;
        window.print = () => { window.printCount += 1; };
      });
      try {
        results.push({ name, passed: true, details: await scenario(page, url) });
      } catch (error) {
        results.push({ name, passed: false, error: error.message });
        await capture(page, '失败现场.png');
        throw error;
      } finally {
        await page.close();
      }
    }
    assert.deepEqual(network.posts, []);
    assert.deepEqual(network.apiRequests, []);
    assert.deepEqual(network.failedResources, []);
    assert.deepEqual(pageErrors, []);
    results.push({ name: '全程静态资源访问与脚本状态', passed: true,
      details: { postRequests: 0, apiRequests: 0, failedResources: 0, pageErrors: 0 } });
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

main().then(() => finish(true), error => {
  console.error(error.stack);
  process.exitCode = 1;
  finish(false);
});

function finish(passed) {
  const summary = { passed, browser: channel, mount, tests: results, network, pageErrors };
  if (evidence) fs.writeFileSync(path.join(evidence, '验收结果.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
}
