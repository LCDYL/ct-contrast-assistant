'use strict';

// CT 对比剂课程项目的浏览器计算模块。
(() => {
  // 检查类型：目标碘流率 IDR (gI/s)、默认注射时长 (s)、总量上限 (mL)、IDR 上限
  const EXAMS = {
    coronary: { label:'冠状动脉 CTA',  idr:1.50, dur:12, maxVol:80,  idrMax:1.80, tip:'升主动脉根部阈值 100 HU 触发，延迟 3–6 s；心率 > 75 次/分建议先控制心率' },
    triple:   { label:'胸痛三联 (TRO)', idr:1.60, dur:15, maxVol:100, idrMax:1.85, tip:'需同期显示右心、左心与主动脉，优先高浓度以压缩体积' },
    headneck: { label:'头颈动脉 CTA',  idr:1.30, dur:12, maxVol:80,  idrMax:1.55, tip:'颈总动脉阈值 120 HU 团注追踪；关注颅底骨伪影与静脉污染' },
    ctpa:     { label:'肺动脉 CTA',    idr:1.30, dur:10, maxVol:70,  idrMax:1.55, tip:'肺动脉主干阈值 150–200 HU；右心功能不全者延长至 12–14 s' },
    aorta:    { label:'主动脉 CTA',    idr:1.40, dur:15, maxVol:110, idrMax:1.70, tip:'全主动脉扫描建议 370 mgI/mL，流率不低于 4 mL/s' },
    abdomen:  { label:'腹部常规增强',  idr:1.10, dur:25, maxVol:110, idrMax:1.35, tip:'动脉期 35–40 s，门静脉期 70–80 s' },
    liver:    { label:'肝脏动态三期',  idr:1.30, dur:25, maxVol:140, idrMax:1.55, tip:'动脉晚期 35 s / 门脉期 70 s / 延迟 180 s，总量须覆盖三期' },
    ctu:      { label:'泌尿系 CTU',    idr:0.75, dur:40, maxVol:120, idrMax:1.00, tip:'排泄期 8–10 min；分次注射可减少总量，检查前后充分水化' },
    leg:      { label:'下肢动脉 CTA',  idr:1.10, dur:30, maxVol:140, idrMax:1.40, tip:'自足向头侧扫描减少静脉污染，总量按扫描长度调整' },
    perfusion:{ label:'CT 灌注 (CTP)', idr:1.55, dur:12, maxVol:70,  idrMax:1.80, tip:'短时高流率注射，采集持续 45–60 s，注射结束后继续扫描' },
    routine:  { label:'其他部位增强',  idr:1.10, dur:25, maxVol:110, idrMax:1.35, tip:'按部位设定延迟时间，常规门脉期为主' }
  };

  // 对比剂：按碘浓度 (mgI/mL) 分组
  const AGENTS = {
    300: [
      { name:'碘海醇 300',   brand:'欧乃派克 300', osm:'低渗', osmo:672, cls:'非离子单体' },
      { name:'碘普罗胺 300', brand:'优维显 300',   osm:'低渗', osmo:607, cls:'非离子单体' },
      { name:'碘美普尔 300', brand:'典迈伦 300',   osm:'低渗', osmo:521, cls:'非离子单体' }
    ],
    320: [
      { name:'碘克沙醇 320', brand:'威视派克 320', osm:'等渗', osmo:290, cls:'非离子二聚体' },
      { name:'碘佛醇 320',   brand:'安射力 320',   osm:'低渗', osmo:702, cls:'非离子单体' }
    ],
    350: [
      { name:'碘海醇 350',   brand:'欧乃派克 350', osm:'低渗', osmo:780, cls:'非离子单体' },
      { name:'碘佛醇 350',   brand:'安射力 350',   osm:'低渗', osmo:792, cls:'非离子单体' },
      { name:'碘美普尔 350', brand:'典迈伦 350',   osm:'低渗', osmo:633, cls:'非离子单体' }
    ],
    370: [
      { name:'碘普罗胺 370', brand:'优维显 370',   osm:'低渗', osmo:774, cls:'非离子单体' },
      { name:'碘帕醇 370',   brand:'碘比乐 370',   osm:'低渗', osmo:796, cls:'非离子单体' }
    ],
    400: [
      { name:'碘美普尔 400', brand:'典迈伦 400',   osm:'低渗', osmo:726, cls:'非离子单体' }
    ]
  };

  // 静脉通路可耐受的最大流率 (mL/s)
  const ACCESS = { '22':3.0, '20':4.5, '18':5.5, cv:5.0, picc:2.5, port:4.5 };
  const ACCESS_TEXT = {
    '22':'22G 外周', '20':'20G 外周', '18':'18G 外周',
    cv:'中心静脉导管', picc:'PICC', port:'输液港'
  };

  const LEVEL_TEXT = ['无', '低', '中', '高', '极高'];

  // 空白数字按 0 读取，选择项和布尔值沿用表单约定。
  function number(form, key) {
    const value = form[key];
    return value === undefined || value === null || value === '' ? 0 : Number(value);
  }

  function clamp(value, lower, upper) {
    return Math.min(Math.max(value, lower), upper);
  }

  function f0(value) {
    return Math.round(value).toString();
  }

  function f1(value) {
    return (Math.round(value * 10) / 10).toFixed(1);
  }

  function bodyMetrics(height, weight) {
    if (height <= 0 || weight <= 0) {
      return { bmi: 0, bsa: 0 };
    }
    return {
      bmi: weight / Math.pow(height / 100, 2),
      bsa: 0.007184 * Math.pow(height, 0.725) * Math.pow(weight, 0.425)
    };
  }

  function bodyLabel(bmi) {
    if (bmi < 18.5) return '偏瘦';
    if (bmi < 24) return '正常';
    if (bmi < 28) return '超重';
    return '肥胖';
  }

  function gfrCategory(egfr) {
    if (egfr === null) return '—';
    if (egfr >= 90) return 'G1';
    if (egfr >= 60) return 'G2';
    if (egfr >= 45) return 'G3a';
    if (egfr >= 30) return 'G3b';
    if (egfr >= 15) return 'G4';
    return 'G5';
  }

  function egfrCKDEPI(scrUmol, age, sex){
    if (!(scrUmol > 0) || !(age > 0)) return null;
    const scr = scrUmol / 88.4;
    const female = sex === 'female';
    const k = female ? 0.7 : 0.9;
    const a = female ? -0.241 : -0.302;
    const r = scr / k;
    const e = 142 * Math.pow(Math.min(r, 1), a) * Math.pow(Math.max(r, 1), -1.200)
              * Math.pow(0.9938, age) * (female ? 1.012 : 1);
    return Math.max(1, Math.round(e));
  }

  function crClCockcroft(scrUmol, age, weight, sex){
    if (!(scrUmol > 0) || !(age > 0) || !(weight > 0)) return null;
    return Math.max(1, Math.round((140 - age) * weight / (0.818 * scrUmol) * (sex === 'female' ? 0.85 : 1)));
  }

  // 根据整份表单生成注射参数、风险和决策说明。
  function evaluate(form) {
    const out = { flags: [], actions: [], chain: [] };

    /* --- 基础 --- */
    const age = number(form, 'age') || 0;
    const sex = (form.sex ?? '') || 'male';
    const h = number(form, 'height') || 0;
    const w = number(form, 'weight') || 0;
    const hr = number(form, 'hr') || 0;
    const { bmi, bsa } = bodyMetrics(h, w);
    const pediatric = age > 0 && age < 18;

    out.bmi = bmi;
    out.bsa = bsa;
    out.bodyText = bmi <= 0 ? '—'
      : bmi < 18.5 ? '偏瘦（'+f1(bmi)+'）'
      : bmi < 24 ? '正常（'+f1(bmi)+'）'
      : bmi < 28 ? '超重（'+f1(bmi)+'）'
      : '肥胖（'+f1(bmi)+'）';

    /* --- 肾功能 --- */
    const scr = number(form, 'scr');
    const egfr = egfrCKDEPI(scr, age, sex);
    const crcl = crClCockcroft(scr, age, w, sex);
    const ckdStage = gfrCategory(egfr);
    out.egfr = egfr;
    out.crcl = crcl;
    out.ckd = ckdStage;

    const dialysis = form.dialysis === undefined ? 'none' : form.dialysis;
    const dm = Boolean(form.dm);
    const renalImpair = egfr != null && egfr < 60;
    const renalMid  = egfr != null && egfr < 45;
    const renalSevere = egfr != null && egfr < 30;

    /* --- 心功能 --- */
    const nyha = Math.trunc(number(form, 'nyha'));
    const efRaw = number(form, 'ef');
    const ef = efRaw > 0 ? efRaw : null;          // 未填写视为未知，不参与评估
    const bnp = Math.trunc(number(form, 'bnp'));
    const bp = form.bp === undefined ? 'normal' : form.bp;
      const heartSevere = nyha >= 3 || (ef !== null && ef < 40);
    const volumeLimited = heartSevere || bp === 'shock';

    /* --- 检查 --- */
    const examKey = (form.exam ?? '') || 'coronary';
    const exam = EXAMS[examKey];
    const durInput = number(form, 'dur');
    let dur = durInput > 0 ? durInput : exam.dur;
    const maxflowInput = number(form, 'maxflow');

    /* --- 静脉通路 --- */
    const gauge = String(form.gauge ?? '');
    const site = form.site === undefined ? 'forearm' : form.site;
    const vein = form.vein === undefined ? 'good' : form.vein;
    let accessMax = ACCESS[gauge] ?? 4.0;
    if (site === 'hand') accessMax -= 0.5;
    if (site === 'other') accessMax -= 0.5;
    if (vein === 'fair') accessMax -= 0.3;
    if (vein === 'poor') accessMax -= 1.0;
    if (Boolean(form.edema)) accessMax -= 0.5;
    if (Boolean(form.priorExtrav)) accessMax -= 0.5;
    if (maxflowInput > 0) accessMax = Math.min(accessMax, maxflowInput);
    accessMax = Math.max(1.0, Math.round(accessMax * 10) / 10);

    /* --- 目标碘流率 --- */
    let idrTarget = exam.idr;
    const idrNotes = [];
    if (bmi >= 35) {
      idrTarget *= 1.15;
      idrNotes.push('BMI ≥ 35，碘流率 +15%');
    }
    else if (bmi >= 28) {
      idrTarget *= 1.08;
      idrNotes.push('BMI ≥ 28，碘流率 +8%');
    }
    else if (bmi > 0 && bmi < 18.5) {
      idrTarget *= 0.95;
      idrNotes.push('低体重，碘流率 −5%');
    }
    if (heartSevere) {
      idrTarget *= 0.85;
      idrNotes.push('心功能不全，碘流率 −15%');
    }
    if (renalMid) {
      idrTarget *= 0.92;
      idrNotes.push('eGFR < 45，碘流率 −8%');
    }
    if (Boolean(form.lowdose)) {
      idrTarget *= 0.70;
      idrNotes.push('低 kV / 低剂量方案，碘流率 −30%');
    }
    idrTarget = clamp(idrTarget, exam.idr * 0.55, exam.idrMax);

    /* --- 浓度决策 --- */
    let conc, concReason;
    const preferIsoOsm = renalSevere || (renalMid && dm) || (renalMid && age >= 75);

    if (pediatric) {
      conc = 320; concReason = '儿童患者选 300–320 mgI/mL，按体重计算碘剂量，减少渗透负荷';
    } else if (preferIsoOsm) {
      conc = 320; concReason = '肾功能受损合并糖尿病/高龄，优先等渗对比剂（碘克沙醇 320）';
    } else if (volumeLimited) {
      conc = 370; concReason = '心功能不全需限制总液体量，选高浓度以减少注射体积';
    } else if (accessMax <= 3.0) {
      conc = 370; concReason = '静脉通路受限，选高浓度以在低流率下达到目标碘流率';
    } else if (idrTarget >= 1.42) {
      conc = 370; concReason = '检查需高碘流率，370 mgI/mL 可在可接受流率下达成';
    } else if (bmi >= 28) {
      conc = 370; concReason = '体重指数偏高，提高浓度以补偿体型衰减';
    } else {
      conc = 350; concReason = '常规体型与通路，350 mgI/mL 为标准选择';
    }

    /* --- 体积与流率 --- */
    let volume, flow, idrActual;
    const capLog = [];
    let accessFail = false;
    let volRaw = 0, flowRaw = 0;

    if (pediatric) {
      const iodinePerKg = 0.40;               // gI/kg
      volume = iodinePerKg * w * 1000 / conc;
      const pcap = 2.4 * w;
      if (volume > pcap) {
        capLog.push(`儿童剂量上限 ${f0(pcap)} mL（2.4 mL/kg）`);
        volume = pcap;
      }
      flow = volume / dur;
      if (flow > accessMax) {
        flow = accessMax;
        volume = flow * dur;
        accessFail = true;
      }
    } else {
      volume = idrTarget * dur * 1000 / conc;
      flow = volume / dur;
      volRaw = volume; flowRaw = flow;

      // ① 通路不足时先升浓度（等渗方案除外，避免破坏渗透压优势）；3% 以内视为可达
      const tol = accessMax * 1.03;
      if (flow > tol && !preferIsoOsm) {
        for (const t of [350, 370, 400]) {
          if (t <= conc) continue;
          const f = idrTarget * 1000 / t;
          if (f <= tol) {
            concReason += `；原流率 ${f1(flow)} mL/s 超通路耐受，改用 ${t} mgI/mL`;
            conc = t; flow = f; volume = flow * dur;
            break;
          }
        }
      }

      // ② 仍超限：优先延长注射时长（保持碘总量），最多延长至基础时长的 1.5 倍
      if (flow > tol) {
        const needDur = volume / accessMax;
        if (needDur <= dur * 1.5) {
          dur = Math.ceil(needDur);
          flow = volume / dur;
          capLog.push(`延长注射时长至 ${dur} s，使流率降至通路耐受范围 ${f1(accessMax)} mL/s`);
        } else {
          capLog.push(`通路耐受上限 ${f1(accessMax)} mL/s，实际流率 ${f1(flow)} mL/s → 降至 ${f1(accessMax)} mL/s`);
          flow = accessMax; volume = flow * dur; accessFail = true;
        }
      }
    }

    /* --- 安全上限 --- */
    const cap = (limit, reason) => {
      if (volume > limit + 0.05) {
        capLog.push(`${reason}：${f1(volume)} → ${f1(limit)} mL`);
        volume = limit;
      }
    };
    cap(exam.maxVol, `${exam.label}总量上限`);
    if (renalSevere && dialysis === 'none') cap(60, 'eGFR < 30 强化限量');
    else if (renalMid && dialysis === 'none') cap(80, 'eGFR 30–44 限量');
    if (nyha >= 4 || (ef !== null && ef < 30)) cap(60, '重度心功能不全限容');
    else if (nyha === 3 || (ef !== null && ef >= 30 && ef < 40)) cap(85, '心功能不全限容');
    if (!pediatric && w > 0) cap(2.6 * w, '按体重上限 2.6 mL/kg');
    if (age >= 80 && dialysis === 'none') {
      volume *= 0.9;
      capLog.push('年龄 ≥ 80 岁，总量再减 10%');
    }
    if (Boolean(form.recentCM) && volume > 50) cap(50, '48 h 内重复使用，单次限量');

    flow = clamp(volume / dur, 0.5, accessMax);
    volume = flow * dur;
    idrActual = volume * conc / 1000 / dur;
    const iodineTotal = volume * conc / 1000;
    const saline = pediatric ? Math.round(w * 1.0) : (conc >= 370 ? 30 : 25);

    /* --- 对比剂候选 --- */
    const pool = AGENTS[conc] || AGENTS[350];
    let primary;
    if (preferIsoOsm && AGENTS[320]) primary = AGENTS[320][0];       // 碘克沙醇 320
    else primary = pool[0];

    const alts = [];
    Object.keys(AGENTS).map(Number)
      .filter(c => c !== conc)
      .forEach(c => {
        const a = AGENTS[c][0];
        if (preferIsoOsm && c === 370) return;
        alts.push({
          name: a.name, conc: c, osm: a.osm,
          why: c < conc
            ? `浓度更低，注射体积 ${f1(idrActual * dur * 1000 / c)} mL，渗透负荷更小，适合肾功能临界或需大量冲洗的检查`
            : `浓度更高，同碘流率下流率可降至 ${f1(idrActual * 1000 / c)} mL/s，适合静脉通路差或需限容`
        });
      });

    /* --- 风险评分 --- */
    // 1. 过敏 / 急性不良反应
    const priorReaction = Math.trunc(number(form, 'priorReaction'));
    let allergyScore = 0;
    const allergyParts = [];
    if (priorReaction === 1) {
      allergyScore += 1;
      allergyParts.push('既往轻度反应 +1');
    }
    if (priorReaction === 2) {
      allergyScore += 3;
      allergyParts.push('既往中度反应 +3');
    }
    if (priorReaction === 3) {
      allergyScore += 4;
      allergyParts.push('既往重度反应 +4');
    }
    if (Boolean(form.drugMulti)) {
      allergyScore += 2;
      allergyParts.push('多种药物过敏 +2');
    }
    if (Boolean(form.drugSevere)) {
      allergyScore += 3;
      allergyParts.push('严重过敏反应史 +3');
    }
    if (Boolean(form.drugBeta) || Boolean(form.drugCeph) || Boolean(form.drugSulfa)) {
      allergyScore += 0.5;
      allergyParts.push('单类抗生素过敏 +0.5');
    }
    if (Boolean(form.foodSeafood) || Boolean(form.foodNuts)) {
      allergyScore += 1;
      allergyParts.push('食物过敏 +1');
    }
    const asthma = Math.trunc(number(form, 'asthma'));
    if (asthma > 0) {
      allergyScore += asthma;
      allergyParts.push('哮喘 +' + asthma);
    }
    if (Boolean(form.atopy)) {
      allergyScore += 1;
      allergyParts.push('特应性疾病 +1');
    }
    if (Boolean(form.mastocytosis)) {
      allergyScore += 2;
      allergyParts.push('肥大细胞增多症 +2');
    }
    if (Boolean(form.anxiety)) {
      allergyScore += 0.5;
      allergyParts.push('焦虑/不配合 +0.5');
    }
    const allergyLevel = allergyScore === 0 ? 0 : allergyScore <= 2 ? 1 : allergyScore <= 4 ? 2 : allergyScore <= 6 ? 3 : 4;

    // 2. PC-AKI
    let akiScore = 0;
    const akiParts = [];
    if (egfr != null) {
      if (egfr < 15) {
        akiScore += 8;
        akiParts.push('eGFR < 15 +8');
      }
      else if (egfr < 30) {
        akiScore += 6;
        akiParts.push('eGFR < 30 +6');
      }
      else if (egfr < 45) {
        akiScore += 4;
        akiParts.push('eGFR 30–44 +4');
      }
      else if (egfr < 60) {
        akiScore += 2;
        akiParts.push('eGFR 45–59 +2');
      }
    }
    if (dm) {
      akiScore += 1;
      akiParts.push('糖尿病 +1');
    }
    if (nyha >= 2) {
      akiScore += 1;
      akiParts.push('心衰 +1');
    }
    if (age >= 75) {
      akiScore += 1;
      akiParts.push('年龄 ≥ 75 +1');
    }
    if (Boolean(form.dehydration)) {
      akiScore += 1;
      akiParts.push('低血容量 +1');
    }
    if (Boolean(form.myeloma)) {
      akiScore += 1;
      akiParts.push('骨髓瘤 +1');
    }
    if (Boolean(form.nephrotox)) {
      akiScore += 1;
      akiParts.push('肾毒性药物 +1');
    }
    if (Boolean(form.singleKidney)) {
      akiScore += 1;
      akiParts.push('单肾 +1');
    }
    if (Boolean(form.recentCM)) {
      akiScore += 2;
      akiParts.push('48 h 内重复 +2');
    }
    const akiLevel = dialysis !== 'none' ? (volumeLimited ? 2 : 0)
      : akiScore <= 1 ? 0 : akiScore <= 3 ? 1 : akiScore <= 5 ? 2 : akiScore <= 7 ? 3 : 4;

    // 3. 心功能 / 容量负荷
    const efScore = ef === null ? 0 : ef >= 50 ? 0 : ef >= 40 ? 1 : ef >= 30 ? 2 : 3;
    let heartScore = nyha + efScore + bnp * 0.5;
    const heartParts = [];
    if (nyha) heartParts.push('NYHA ' + ['','I','II','III','IV'][nyha] + ' +' + nyha);
    if (efScore && ef !== null) heartParts.push('EF ' + f0(ef) + '% +' + efScore);
    if (bnp) heartParts.push('BNP ' + bnp + ' 级 +' + (bnp * 0.5));
    if (Boolean(form.pah)) {
      heartScore += 1;
      heartParts.push('肺动脉高压 +1');
    }
    if (Boolean(form.as)) {
      heartScore += 1;
      heartParts.push('重度主动脉瓣狭窄 +1');
    }
    if (bp === 'low') {
      heartScore += 1;
      heartParts.push('血压偏低 +1');
    }
    if (bp === 'shock') {
      heartScore += 2;
      heartParts.push('休克 +2');
    }
    if (Boolean(form.chfHosp)) {
      heartScore += 1;
      heartParts.push('近期心衰住院 +1');
    }
    const heartLevel = heartScore < 1 ? 0 : heartScore <= 2 ? 1 : heartScore <= 4 ? 2 : heartScore <= 6 ? 3 : 4;

    // 4. 二甲双胍
    const met = form.metformin === undefined ? 'none' : form.metformin;
    let metScore = null, metLevel = 0, metParts = [];
    if (met !== 'none') {
      let s = 0;
      if (egfr == null) {
        s += 2;
        metParts.push('eGFR 未评估 +2');
      }
      else if (egfr >= 60) {
        s += 1;
        metParts.push('eGFR ≥ 60 +1');
      }
      else if (egfr >= 45) {
        s += 2;
        metParts.push('eGFR 45–59 +2');
      }
      else if (egfr >= 30) {
        s += 3;
        metParts.push('eGFR 30–44 +3');
      }
      else { s += 4; metParts.push('eGFR < 30 +4'); }
      if (age >= 75) {
        s += 1;
        metParts.push('年龄 ≥ 75 +1');
      }
      else if (age >= 65) {
        s += 0.5;
        metParts.push('年龄 65–74 +0.5');
      }
      if (met === '2000') {
        s += 1;
        metParts.push('剂量 2000 mg +1');
      }
      else if (met === '1500') {
        s += 0.5;
        metParts.push('剂量 1500 mg +0.5');
      }
      else if (met === 'gt2000') {
        s += 1.5;
        metParts.push('剂量 > 2000 mg +1.5');
      }
      metScore = s;
      metLevel = s <= 2 ? 1 : s <= 3.5 ? 2 : s <= 5.5 ? 3 : 4;
    }

    // 5. 外渗
    let exScore = 0;
    const exParts = [];
    const gScore = { '22':3, '20':2, '18':0, cv:-2, picc:-1, port:-1 }[gauge] ?? 2;
    exScore += gScore;
    const sScore = { hand:2, forearm:1, antecubital:0, other:1 }[site] ?? 1;
    exScore += sScore;
    exScore += vein === 'poor' ? 2 : vein === 'fair' ? 1 : 0;
    if (Boolean(form.priorExtrav)) {
      exScore += 2;
      exParts.push('既往外渗 +2');
    }
    if (Boolean(form.chemo)) {
      exScore += 1;
      exParts.push('化疗史 +1');
    }
    if (Boolean(form.edema)) {
      exScore += 1;
      exParts.push('上肢水肿 +1');
    }
    if (age >= 75) {
      exScore += 1;
      exParts.push('高龄 +1');
    }
    if (Boolean(form.anxiety)) {
      exScore += 1;
      exParts.push('无法配合 +1');
    }
    exScore = Math.max(0, exScore);
    const exLevel = exScore <= 1 ? 0 : exScore <= 3 ? 1 : exScore <= 5 ? 2 : exScore <= 7 ? 3 : 4;

    const overall = Math.max(allergyLevel, akiLevel, heartLevel, metLevel, exLevel);
    const hyperthyroid = Boolean(form.hyperthyroid);
    const pregnant = (form.preg ?? '') === 'pregnant';

    let verdict = 'ok';
    if (hyperthyroid || akiLevel === 4 || (egfr != null && egfr < 30 && dialysis === 'none') || allergyLevel === 4) verdict = 'hold';
    else if (overall >= 3) verdict = 'caution';

    /* --- 提示 --- */
    const flags = out.flags;
    const addFlag = (sev, text) => flags.push({ sev, text });

    if (egfr != null && egfr < 30 && dialysis === 'none') {
      addFlag('danger', `<b>eGFR ${egfr}（G5）</b>：原则上避免碘对比剂。如临床必需，须肾内科会诊、限量 ≤ 60 mL、强化水化，并签署知情同意。`);
    } else if (egfr != null && egfr < 45) {
      addFlag('danger', `<b>eGFR ${egfr}（${ckdStage}）</b>：对比剂肾病风险显著升高，总量控制在 ${f0(volume)} mL 以内，术前 4–6 h 开始等渗盐水水化。`);
    } else if (egfr != null && egfr < 60) {
      addFlag('warn', `<b>eGFR ${egfr}（G3a）</b>：轻中度肾功能下降，加强监测，避免 48 h 内重复使用对比剂。`);
    } else if (egfr == null) {
      addFlag('warn', '未填写血肌酐，无法评估肾功能。建议补充肌酐/近期 eGFR 后再决定用量。');
    }

    if (hyperthyroid) addFlag('danger', '<b>甲亢未控制</b>：碘负荷可诱发甲状腺危象，应先由内分泌科控制甲亢，除非为抢救性检查。');
    if (pregnant) addFlag('danger', '<b>妊娠期</b>：仅在获益明确大于风险时使用，并与产科共同决策；优先考虑 MRI 或超声替代。');
    if ((form.preg ?? '') === 'lactating') addFlag('info', '哺乳期：单次碘对比剂后可继续哺乳，无需停乳（ACR 2024）。');
    if (Boolean(form.pheo)) addFlag('warn', '<b>嗜铬细胞瘤</b>：理论上可诱发儿茶酚胺释放，需 α 受体阻滞准备到位，检查中严密监测血压。');
    if (Boolean(form.myasthenia)) addFlag('warn', '<b>重症肌无力</b>：对比剂可能加重肌无力症状，术后加强观察呼吸肌力量。');
    if (Boolean(form.myeloma)) addFlag('warn', '多发性骨髓瘤：合并脱水时肾损伤风险升高，务必充分水化。');
    if (Boolean(form.dehydration)) addFlag('warn', '存在低血容量/脱水：先补液纠正再注射对比剂，可显著降低肾损伤风险。');
    if (Boolean(form.recentCM)) addFlag('warn', '48 h 内已使用碘对比剂：建议间隔 ≥ 48–72 h，非急诊应推迟。');
    if (dialysis !== 'none') addFlag('info', '透析患者不存在对比剂肾病风险，但需控制容量负荷；建议检查后 4–6 h 内安排透析。');
    if (Boolean(form.as)) addFlag('warn', '重度主动脉瓣狭窄：注射引起的血流动力学波动耐受差，降低流率并连续监测血压。');
    if (bp === 'shock') addFlag('danger', '休克状态：先稳定循环，对比剂注射可加重低血压，需麻醉/重症团队在场。');
    if (met !== 'none' && metLevel >= 3) addFlag('danger', `二甲双胍相关乳酸酸中毒风险${LEVEL_TEXT[metLevel]}，建议内分泌科会诊并停用二甲双胍。`);
    if (allergyLevel >= 3) addFlag('danger', `急性不良反应风险${LEVEL_TEXT[allergyLevel]}：需强化预处理，注射现场备齐抢救药品与设备。`);
    else if (allergyLevel === 2) addFlag('warn', '存在过敏高危因素：建议标准预处理并延长注射后观察至 30 min。');
    if (exLevel >= 3) addFlag('danger', `外渗风险${LEVEL_TEXT[exLevel]}：建议更换为 18G 以上肘正中静脉或中心静脉通路后再注射。`);
    if (accessFail) addFlag('danger', `<b>当前通路无法满足目标碘流率</b>：${exam.label} 需 ${f1(idrTarget)} gI/s，即 ${f1(idrTarget * 1000 / conc)} mL/s，而${ACCESS_TEXT[gauge] || '该通路'}仅耐受 ${f1(accessMax)} mL/s。请更换 18G 以上前臂/肘正中静脉或中心静脉后再检查。`);
    if (!accessFail && idrActual < exam.idr * 0.85) addFlag('warn', `安全限幅后碘流率为 ${f1(idrActual)} gI/s（目标 ${f1(exam.idr)} gI/s，−${f0((1 - idrActual / exam.idr) * 100)}%），图像强化程度可能不足，可考虑延长采集或降低 kV 补偿。`);
    if (heartLevel >= 3) addFlag('warn', '心功能不全：控制总液体量，注射后监测呼吸、肺部湿啰音与尿量。');
    if (pediatric) addFlag('info', '儿童患者：按体重计算碘剂量（0.4 gI/kg），使用低压注射管路并全程陪护。');
    if (hr > 80 && examKey === 'coronary') addFlag('warn', `心率 ${hr} 次/分偏高：冠脉 CTA 建议先控制心率至 65–75 次/分（β 阻滞剂/伊伐布雷定）。`);
    if (Boolean(form.lowdose)) addFlag('info', '已启用低 kV / 低剂量方案：碘流率下调 30%，可配合迭代重建维持图像质量。');
    if (!(volume > 0)) addFlag('warn', '参数不完整，结果仅供参考。');

    /* --- 处置 --- */
    const actions = out.actions;

    if (allergyLevel >= 2) {
      actions.push({
        cls: 'danger', t: '预处理（过敏风险 ' + LEVEL_TEXT[allergyLevel] + '）',
        d: '甲泼尼龙 40 mg 静注：检查前 12 h 与 2 h 各一次；或泼尼松 50 mg 口服：前 13 h / 7 h / 1 h。加苯海拉明 50 mg 肌注（前 1 h）。哮喘患者加用吸入 β₂ 受体激动剂。急诊无法等待时：氢化可的松 200 mg 静注 + 苯海拉明 50 mg 静注，并全程备抢救。'
      });
    }
    if (allergyLevel === 4) {
      actions.push({ cls:'danger', t:'考虑替代检查', d:'极高过敏风险，建议改用非碘对比剂方案（MRI 增强、超声造影或平扫），必须使用时由高年资医师在场并签署知情同意。' });
    }
    if (egfr != null && egfr < 45 && dialysis === 'none') {
      const rate = heartSevere ? 0.5 : 1.0;
      actions.push({
        cls: 'warn', t: '水化方案',
        d: `0.9% 氯化钠 ${f1(rate * (w || 60))} mL/h（${rate} mL/kg/h），术前 4–6 h 开始，持续至术后 6–12 h；维持尿量 > 0.5 mL/kg/h。${heartSevere ? '合并心功能不全，减半并监测容量。' : ''}`
      });
    }
    if (met !== 'none') {
      const stopH = egfr != null && egfr < 60 ? 48 : 0;
      actions.push({
        cls: metLevel >= 3 ? 'danger' : 'warn', t: '二甲双胍处理（评分 ' + metScore + '，' + LEVEL_TEXT[metLevel] + '风险）',
        d: stopH ? '检查前 48 h 停用二甲双胍；检查后 48–72 h 复查血肌酐/eGFR，确认稳定后再恢复用药。' 
                 : 'eGFR ≥ 60 者可不中断，但建议检查后 48 h 复查肾功能正常再恢复；如为动脉内给药则必须停药。'
      });
    }
    if (dialysis !== 'none') actions.push({ cls:'muted', t:'透析安排', d:'检查后 4–6 h 内安排透析，清除对比剂；无需额外预防性水化，注意透析间期容量评估。' });
    if (hyperthyroid) actions.push({ cls:'danger', t:'甲状腺处理', d:'先控制甲亢（抗甲状腺药物 + β 阻滞剂），必要时内分泌科会诊后再行增强检查。' });
    if (exLevel >= 2 || accessFail) actions.push({ cls:'warn', t:'静脉通路', d:'建议改用 18G 及以上、肘正中/前臂粗直静脉；注射前回血确认、生理盐水试推 10 mL 无外渗，注射中每 15 s 触诊穿刺点。' });
    if (Boolean(form.lowdose)) actions.push({ cls:'muted', t:'低剂量技术', d:'70–90 kVp + 迭代/深度学习重建，可用更低碘流率获得同等强化；噪声指数适度放宽。' });
    actions.push({ cls:'muted', t:'注射后观察', d: allergyLevel >= 2 ? '留观 30 min，前 10 min 每 3–5 min 巡视一次；迟发反应可至 1 周，告知患者返院指征。' : '留观 15–30 min，出现皮疹、气促、恶心立即报告。' });

    /* --- 决策链 --- */
    const chain = out.chain;
    chain.push(`体型：身高 ${f0(h)} cm / 体重 ${f1(w)} kg，<b>BMI ${f1(bmi)}</b>，BSA ${f1(bsa)} m²`);
    chain.push(egfr != null
      ? `肾功能：血肌酐 ${f0(scr)} μmol/L → <b>eGFR ${egfr} mL/min/1.73m²（${ckdStage}）</b>，Cockcroft-Gault CrCl ${crcl} mL/min`
      : '肾功能：未提供血肌酐，跳过肾小球滤过评估');
    chain.push(`检查：<b>${exam.label}</b>，基础目标碘流率 ${f1(exam.idr)} gI/s，注射时长 ${f0(dur)} s`);
    if (idrNotes.length) chain.push('碘流率修正：' + idrNotes.join('；') + ` → <b>${f1(idrTarget)} gI/s</b>`);
    chain.push(`浓度决策：<b>${conc} mgI/mL</b> —— ${concReason}`);
    chain.push(`体积推算：${f1(idrTarget)} gI/s × ${f0(dur)} s ÷ ${conc} mgI/mL = ${f1(volRaw)} mL，流率 ${f1(flowRaw)} mL/s → 限幅后 <b>${f1(volume)} mL</b> / ${f1(flow)} mL/s`);
    if (capLog.length) chain.push('安全限幅：' + capLog.join('；'));
    chain.push(`通路校验：${ACCESS_TEXT[gauge] || '外周'}可耐受 ${f1(accessMax)} mL/s，实际 ${f1(flow)} mL/s ${accessFail ? '⚠ 低于目标碘流率，需更换通路' : '✓ 通过'}`);
    chain.push(`实际碘流率：<b>${f1(idrActual)} gI/s</b>（目标 ${f1(idrTarget)} gI/s），碘总量 ${f1(iodineTotal)} gI`);
    chain.push(`综合风险：过敏 ${LEVEL_TEXT[allergyLevel]} / 肾损伤 ${LEVEL_TEXT[akiLevel]} / 心功能 ${LEVEL_TEXT[heartLevel]} / 外渗 ${LEVEL_TEXT[exLevel]} → <b>${verdict === 'ok' ? '可按方案执行' : verdict === 'caution' ? '谨慎执行' : '暂缓或替代'}</b>`);

    /* --- 组装 --- */
    out.age = age;
    out.sex = sex;
    out.w = w;
    out.egfr = egfr;
    out.exam = { ...exam };
    out.dur = dur;
    out.conc = conc;
    out.primary = { ...primary };
    out.volume = volume;
    out.flow = flow;
    out.idrActual = idrActual;
    out.iodineTotal = iodineTotal;
    out.saline = saline;
    out.alts = alts;
    out.accessMax = accessMax;
    out.capLog = capLog;
    out.concReason = concReason;
    out.idrTarget = idrTarget;
    out.accessFail = accessFail;
    out.risks = [
      { name:'急性不良反应 / 过敏', level:allergyLevel, score:allergyScore.toFixed(1), parts:allergyParts },
      { name:'对比剂相关肾损伤 (PC-AKI)', level:akiLevel, score:akiScore.toString(), parts:akiParts },
      { name:'心功能 / 容量负荷', level:heartLevel, score:heartScore.toFixed(1), parts:heartParts },
      { name:'二甲双胍相关乳酸酸中毒', level:metScore === null ? -1 : metLevel, score:metScore === null ? '未用' : metScore.toFixed(1), parts:metParts },
      { name:'静脉外渗', level:exLevel, score:exScore.toString(), parts:exParts }
    ];
    out.overall = overall;
    out.verdict = verdict;
    out.pediatric = pediatric;

    return out;
  }


  // 预览只计算体型与肾功能指标。
  function preview(form) {
    const age = number(form, 'age');
    const height = number(form, 'height');
    const weight = number(form, 'weight');
    const scr = number(form, 'scr');
    const sex = form.sex || 'male';
    const { bmi, bsa } = bodyMetrics(height, weight);
    const egfr = egfrCKDEPI(scr, age, sex);
    return {
      bmi,
      bsa,
      body: bodyLabel(bmi),
      egfr,
      ckd: gfrCategory(egfr),
      crcl: crClCockcroft(scr, age, weight, sex)
    };
  }

  globalThis.CTContrast = { evaluate, preview };
})();
