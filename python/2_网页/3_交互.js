'use strict';

const $ = id => document.getElementById(id);
const val = id => $(id)?.value ?? '';
const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
const f1 = value => (Math.round(value * 10) / 10).toFixed(1);
const f0 = value => Math.round(value).toString();
const LEVEL_TEXT = ['无', '低', '中', '高', '极高'];
const LEVEL_COLOR = ['#0f9d58', '#1f6fd0', '#d99612', '#d9480f', '#cf2b2b'];

async function requestCalculation(path, fields){
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  });
  if (!response.ok) throw new Error(`计算接口返回 ${response.status}`);
  return response.json();
}

function collectFields(){
  const fields = { sex: radio('sex'), preg: radio('preg') };
  $('form').querySelectorAll('input[id], select[id]').forEach(control => {
    if (control.type === 'radio' || control.id === 'pName') return;
    fields[control.id] = control.type === 'checkbox' ? control.checked : control.value;
  });
  return fields;
}

let previewKey;

function setReading(id, value, className = ''){
  const reading = $(id);
  reading.textContent = value;
  reading.className = className;
}

async function updateLive(){
  const fields = {
    age: val('age'), sex: radio('sex'), height: val('height'), weight: val('weight'), scr: val('scr')
  };
  const key = JSON.stringify(fields);
  if (previewKey === key) return;
  previewKey = key;

  let result;
  try {
    result = await requestCalculation('/api/preview', fields);
  } catch (error) {
    if (previewKey === key) previewKey = undefined;
    return;
  }
  if (previewKey !== key) return;

  const { bmi, bsa, body, egfr, ckd, crcl } = result;
  setReading('outBmi', bmi > 0 ? f1(bmi) + ' kg/m²' : '待填写');
  setReading('outBsa', bsa > 0 ? f1(bsa) + ' m²' : '待填写');
  setReading('outBody', bmi > 0 ? `${body}（${f1(bmi)}）` : '待填写');

  if (egfr === null){
    setReading('outEgfr', '待填写肌酐');
    setReading('outCkd', '—');
    setReading('outCcr', '—');
    setReading('outRenalHint', '留空则跳过肾功能评估', 'small');
    return;
  }

  const tone = egfr >= 60 ? 'ok' : egfr >= 45 ? 'warn' : 'danger';
  const category = egfr >= 60 ? ' 正常/轻度' : egfr >= 30 ? ' 中度下降' : ' 重度下降';
  const hint = egfr >= 90 ? 'GFR 正常，常规用量'
    : egfr >= 60 ? '轻度下降，无需调整'
    : egfr >= 45 ? '轻中度下降，限量 + 监测'
    : egfr >= 30 ? '中重度下降，减量 + 水化' : '重度下降，原则上避免';
  setReading('outEgfr', egfr + ' mL/min/1.73m²', tone);
  setReading('outCkd', ckd + category, egfr >= 60 ? '' : tone);
  setReading('outCcr', crcl === null ? '—' : crcl + ' mL/min');
  setReading('outRenalHint', hint, 'small ' + tone);
}

/* ---------------------------- 结果渲染 ---------------------------- */

function renderReport(r){
  const v = $('verdict');
  v.className = 'verdict' + (r.verdict === 'hold' ? ' hold' : r.verdict === 'caution' ? ' caution' : '');
  $('verdictTag').textContent = r.verdict === 'hold' ? '建议暂缓 / 替代'
    : r.verdict === 'caution' ? '谨慎使用' : '推荐方案';
  $('verdictCase').textContent =
    `${r.exam.label} · ${r.age} 岁${r.sex === 'female' ? '女' : '男'} · ${f0(r.w)} kg`;

  $('agentName').textContent = r.primary.name;
  $('agentSub').textContent =
    `${r.primary.brand}　|　${r.primary.cls}　|　${r.primary.osm}（${r.primary.osmo} mOsm/kg H₂O）`;
  $('agentMeta').innerHTML = [
    `${r.conc} mgI/mL`, `${f1(r.volume)} mL`, `${f1(r.flow)} mL/s`, `${f1(r.iodineTotal)} gI`
  ].map(t => `<span>${t}</span>`).join('');

  $('printMeta').textContent =
    `患者 ${val('pName') || '—'}　|　${r.age} 岁${r.sex === 'female' ? '女' : '男'}　|　${f1(r.w)} kg　BMI ${f1(r.bmi)}　|　`
    + `${r.exam.label}　|　生成时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;

  const met = [
    ['注射体积', f1(r.volume), 'mL', true],
    ['注射流率', f1(r.flow), 'mL/s', true],
    ['注射时长', f0(r.dur), 's', false],
    ['碘总量', f1(r.iodineTotal), 'gI', false],
    ['碘流率 IDR', f1(r.idrActual), 'gI/s', false],
    ['盐水冲管', f0(r.saline), 'mL', false]
  ];
  $('metrics').innerHTML = met.map(m =>
    `<div class="metric${m[3] ? ' hl' : ''}"><div class="k">${m[0]}</div><div class="v">${m[1]}<small>${m[2]}</small></div></div>`
  ).join('');

  $('flags').innerHTML = r.flags.map(f => `<li class="${f.sev}">${f.text}</li>`).join('')
    || '<li class="ok">所有输入参数均在安全范围，可按标准流程执行。</li>';

  $('actions').innerHTML = r.actions.map(a =>
    `<div class="act ${a.cls}"><div class="a-t">${a.t}</div><div class="a-d">${a.d}</div></div>`
  ).join('');

  $('risks').innerHTML = r.risks.map(k => {
    if (k.level < 0){
      return `<div class="risk-row"><div class="r-top"><span class="r-name">${k.name}</span><span class="r-lv lv-0">不适用</span></div>
        <div class="bar"><i style="width:0%;background:var(--line)"></i></div>
        <div class="r-score">患者未使用该药物</div></div>`;
    }
    const pct = Math.round((k.level / 4) * 100);
    return `<div class="risk-row">
      <div class="r-top"><span class="r-name">${k.name}</span><span class="r-lv lv-${k.level}">${LEVEL_TEXT[k.level]}风险</span></div>
      <div class="bar"><i style="width:${Math.max(5, pct)}%;background:${LEVEL_COLOR[k.level]}"></i></div>
      <div class="r-score">评分 ${k.score}${k.parts && k.parts.length ? '　·　' + k.parts.join('，') : ''}</div>
    </div>`;
  }).join('');

  $('alts').innerHTML = r.alts.slice(0, 3).map(a =>
    `<div class="alt"><div class="a-name">${a.name} <span style="color:var(--muted);font-weight:600">· ${a.osm}</span></div><div class="a-why">${a.why}</div></div>`
  ).join('');

  $('chain').innerHTML = r.chain.map(c => `<li>${c}</li>`).join('');
}

/* ---------------------------- 向导控制 ---------------------------- */

const TOTAL_STEPS = 6;
let curStep = 1;
let reportVersion = 0;
let reportPending = false;

const panels = () => Array.from(document.querySelectorAll('.step-panel'));
const stepperItems = () => Array.from(document.querySelectorAll('.stepper li'));

function setError(el, text){
  el.classList.add('invalid');
  const host = el.closest('.field');
  if (!host) return;
  let msg = host.querySelector('.field-msg');
  if (!msg){
    msg = document.createElement('span');
    msg.className = 'field-msg';
    host.appendChild(msg);
  }
  msg.textContent = text;
}

function validateStep(n){
  const panel = panelOf(n);
  if (!panel) return true;
  let firstBad = null;

  // 先清掉本步骤所有历史提示，避免旧的必填错误残留
  panel.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
  panel.querySelectorAll('.field-msg').forEach(el => el.remove());

  panel.querySelectorAll('input, select').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') return;
    const raw = (el.value || '').trim();
    const required = el.hasAttribute('data-required');
    const min = el.dataset.min !== undefined ? parseFloat(el.dataset.min) : null;
    const max = el.dataset.max !== undefined ? parseFloat(el.dataset.max) : null;

    if (!raw){
      if (required){ setError(el, '此项必填'); firstBad = firstBad || el; }
      return;
    }
    const v = parseFloat(raw);
    if (isFinite(v)){
      if (min !== null && v < min){ setError(el, `不能小于 ${min}`); firstBad = firstBad || el; }
      else if (max !== null && v > max){ setError(el, `不能大于 ${max}`); firstBad = firstBad || el; }
    }
  });

  // 性别必选
  if (n === 1 && !radio('sex')){
    const host = panel.querySelector('[data-radio="sex"]').closest('.field');
    if (host && !host.querySelector('.field-msg')){
      const msg = document.createElement('span');
      msg.className = 'field-msg';
      msg.textContent = '请选择性别';
      host.appendChild(msg);
    }
    firstBad = firstBad || panel.querySelector('[data-radio="sex"] input');
  }

  if (firstBad){
    firstBad.focus({ preventScroll: true });
    firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }
  return true;
}

function panelOf(n){
  return document.querySelector(`.step-panel[data-step="${n}"]`);
}

function showStep(n, skipValidate){
  const target = Math.min(Math.max(n, 1), TOTAL_STEPS);
  curStep = target;

  panels().forEach(p => p.classList.toggle('hidden', Number(p.dataset.step) !== target));

  stepperItems().forEach(li => {
    const k = Number(li.dataset.goto);
    li.classList.toggle('active', k === target);
    li.classList.toggle('done', k < target);
  });

  const fill = $('progressFill');
  if (fill) fill.style.width = (target / TOTAL_STEPS * 100).toFixed(1) + '%';
  $('progressText').textContent = `第 ${target} / ${TOTAL_STEPS} 步`;

  document.querySelectorAll('#navDots i').forEach((d, i) => d.classList.toggle('on', i + 1 === target));

  $('btnPrev').disabled = target === 1;
  $('btnNext').textContent = target === TOTAL_STEPS ? '生成方案' : '下一步';
  $('btnNext').disabled = reportPending;

  updateLive();
  if (!skipValidate) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goNext(){
  if (!validateStep(curStep)) return;
  if (curStep < TOTAL_STEPS){ showStep(curStep + 1); }
  else { finish(); }
}

async function finish(){
  if (reportPending || !validateStep(curStep)) return;
  const version = ++reportVersion;
  const status = $('calculationError');
  status.hidden = true;
  reportPending = true;
  $('btnNext').disabled = true;
  $('btnDemo').disabled = true;
  try {
    const result = await requestCalculation('/api/evaluate', collectFields());
    if (version !== reportVersion) return;
    renderReport(result);
    $('wizard').classList.add('hidden');
    $('report').classList.remove('hidden');
    document.body.classList.add('has-report');
    $('btnPrint').classList.remove('hidden');
    window.scrollTo(0, 0);
  } catch (error) {
    if (version === reportVersion) status.hidden = false;
  } finally {
    if (version === reportVersion){
      reportPending = false;
      $('btnNext').disabled = false;
      $('btnDemo').disabled = false;
    }
  }
}

function backToWizard(){
  $('report').classList.add('hidden');
  $('wizard').classList.remove('hidden');
  document.body.classList.remove('has-report');
  $('btnPrint').classList.add('hidden');
  showStep(TOTAL_STEPS);
}

/* ---------------------------- 事件 ---------------------------- */

function buildDots(){
  const box = $('navDots');
  if (!box) return;
  box.innerHTML = Array.from({ length: TOTAL_STEPS }, () => '<i></i>').join('');
}

function bind(){
  const form = $('form');
  form.addEventListener('input', updateLive);
  form.addEventListener('change', updateLive);
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
  });

  $('btnNext').addEventListener('click', goNext);
  $('btnPrev').addEventListener('click', () => { if (curStep > 1) showStep(curStep - 1); });
  $('btnBack').addEventListener('click', backToWizard);
  $('btnPrint').addEventListener('click', () => window.print());
  $('btnPrint2').addEventListener('click', () => window.print());

  stepperItems().forEach(li => {
    li.addEventListener('click', () => {
      const k = Number(li.dataset.goto);
      if (k === curStep) return;
      if (k < curStep){ showStep(k); return; }
      for (let i = curStep; i < k; i++){
        showStep(i, true);
        if (!validateStep(i)) return;
      }
      showStep(k);
    });
  });

  $('btnReset').addEventListener('click', () => {
    reportVersion += 1;
    reportPending = false;
    $('btnDemo').disabled = false;
    $('calculationError').hidden = true;
    form.reset();
    form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    form.querySelectorAll('.field-msg').forEach(el => el.remove());
    $('dur').placeholder = '自动';
    $('exam').value = '';
    $('gauge').value = '';
    backToWizard();
    showStep(1);
  });

  $('btnDemo').addEventListener('click', loadDemo);

  // 从结果页跳回时保持滚动位置合理
  window.addEventListener('beforeprint', () => {});
}

function loadDemo(){
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };

  set('pName', '示例患者');
  set('age', 74); set('height', 165); set('weight', 82);
  document.querySelector('input[name="sex"][value="female"]').checked = true;

  set('exam', 'coronary'); set('hr', 84); set('dur', ''); set('maxflow', '');
  $('lowdose').checked = false; $('dualflow').checked = false;

  set('scr', 132); set('metformin', '1500'); set('dialysis', 'none');
  $('dm').checked = true; $('singleKidney').checked = false; $('myeloma').checked = false;
  $('dehydration').checked = false; $('recentCM').checked = false; $('nephrotox').checked = false;

  set('nyha', '2'); set('ef', 43); set('bnp', '2'); set('bp', 'normal');
  $('pah').checked = false; $('as').checked = false; $('chfHosp').checked = false;

  set('priorReaction', '1'); set('asthma', '0');
  ['drugBeta','drugCeph','drugSulfa','drugMulti','drugSevere','foodSeafood','foodNuts',
   'atopy','mastocytosis','hyperthyroid','pheo','myasthenia','anxiety','steroid']
    .forEach(id => { const el = $(id); if (el) el.checked = false; });
  $('drugBeta').checked = true;
  document.querySelector('input[name="preg"][value="none"]').checked = true;

  set('gauge', '20'); set('site', 'forearm'); set('vein', 'fair');
  $('priorExtrav').checked = false; $('chemo').checked = false; $('edema').checked = false;

  form_clearErrors();
  finish();
}

function form_clearErrors(){
  const form = $('form');
  form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
  form.querySelectorAll('.field-msg').forEach(el => el.remove());
}

document.addEventListener('DOMContentLoaded', () => {
  buildDots();
  bind();
  showStep(1, true);

  // 支持 #demo 直接看结果
  if (location.hash === '#demo') loadDemo();
});
