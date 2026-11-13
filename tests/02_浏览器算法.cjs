'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 加载与在线网页相同的算法文件，输入从标准输入接收。
const source = path.join(__dirname, '..', 'docs', '4_算法.js');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(source, 'utf8'), context, { filename: source });
const forms = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = forms.map(form => ({
    evaluate: context.CTContrast.evaluate(form),
    preview: context.CTContrast.preview(form),
}));
process.stdout.write(JSON.stringify(results));
