/* Study-only memory projection: source text is never retained or returned. */
const FORMAT = 'shizhi-study-memory';
const REASON = '历史学习话题，掌握情况待自测';
const MAX_BYTES = 200 * 1024;
const SOURCES = new Set(['codex-local', 'chatgpt-import', 'manual']);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };

const rows = [
  ['c-io', 'c', 'C 程序与输入输出', ['C语言', 'C 语言', 'C入门', 'C 初学', 'C初学', 'C 基础', 'C基础', 'C programming', 'C beginner', 'printf', 'scanf', 'stdio'], 'c-01'],
  ['c-types', 'c', '变量、类型与整数除法', ['C变量', 'C 变量', 'C类型', '整数除法', 'integer division', 'int 类型'], 'c-02'],
  ['c-conditions', 'c', '条件判断与边界', ['C条件', 'C 条件', 'C分支', 'if else', '条件判断', '边界条件'], 'c-03'],
  ['c-loops', 'c', '循环、累加与循环不变量', ['C循环', 'C 循环', '循环不变量', '循环累加', '水仙花数', 'narcissistic number'], 'c-04'],
  ['c-primes', 'c', '素数判断与效率', ['素数', '质数', 'prime number', 'primality'], 'c-05'],
  ['c-arrays', 'c', '数组与下标', ['C数组', 'C 数组', '数组下标', '数组越界', 'array index'], 'c-06'],
  ['c-functions', 'c', '函数与参数传递', ['C函数', 'C 函数', '参数传递', '按值传递', 'pass by value'], 'c-07'],
  ['c-strings', 'c', '字符串与结束符', ['C字符串', 'C 字符串', '字符串结束符', 'null terminator', 'strlen'], 'c-08'],
  ['c-pointers', 'c', '指针与交换两个数', ['指针', 'pointer', '交换两个数', 'swap in C'], 'c-09'],
  ['c-structs', 'c', '结构体与成绩表', ['结构体', 'struct', 'C成绩表'], 'c-10'],
  ['python-basics', 'python', 'Python 变量、表达式与类型', ['Python', 'Python变量', 'Python 变量', '动态类型'], 'python-01'],
  ['python-io', 'python', 'Python 输入输出与格式化', ['Python输入', 'Python 输入', 'Python输出', 'f-string', 'formatted string'], 'python-02'],
  ['python-conditions', 'python', 'Python 分支、缩进与布尔逻辑', ['Python分支', 'Python 分支', 'Python缩进', '布尔逻辑', 'boolean logic'], 'python-03'],
  ['python-loops', 'python', 'Python for、range 与循环', ['Python循环', 'Python 循环', 'range(', 'for loop in Python'], 'python-04'],
  ['python-functions', 'python', 'Python 函数与默认参数', ['Python函数', 'Python 函数', '默认参数', 'default argument', 'def '], 'python-05'],
  ['python-lists', 'python', '列表、切片与浅复制', ['Python列表', 'Python 列表', '列表切片', '浅复制', 'shallow copy', 'list slicing'], 'python-06'],
  ['python-dicts', 'python', '字典、集合与词频统计', ['Python字典', 'Python 字典', '词频统计', 'dictionary', 'Python集合'], 'python-07'],
  ['python-comprehensions', 'python', '推导式、排序与清晰度', ['推导式', 'comprehension', 'Python排序', 'Python 排序'], 'python-08'],
  ['python-files', 'python', '文本文件、JSON 与异常', ['Python文件', 'Python 文件', 'Python异常', 'Python JSON', 'json.load', 'try except'], 'python-09'],
  ['python-debugging', 'python', '调试与学习时长统计', ['Python调试', 'Python 调试', 'Python debug', '学习时长统计'], 'python-10'],
  ['calculus-functions', 'calculus', '定义域、陪域与值域', ['高数', '高等数学', 'calculus', '定义域', '陪域', '值域', 'codomain', 'domain of a function'], 'calculus-01'],
  ['calculus-limits', 'calculus', '极限：靠近时的趋势', ['极限', 'limit of a function', 'limits in calculus'], 'calculus-02'],
  ['calculus-limit-methods', 'calculus', '求极限与代数变形', ['求极限', '极限变形', '有理化', 'evaluate a limit'], 'calculus-03'],
  ['calculus-infinitesimals', 'calculus', '重要极限与等价无穷小', ['重要极限', '等价无穷小', 'infinitesimal', 'sin x/x'], 'calculus-04'],
  ['calculus-continuity', 'calculus', '连续性与间断点', ['连续性', '间断点', 'continuity', 'discontinuity'], 'calculus-05'],
  ['calculus-derivatives', 'calculus', '导数与瞬时变化率', ['导数', '瞬时变化率', 'derivative', 'instantaneous rate'], 'calculus-06'],
  ['calculus-chain-rule', 'calculus', '求导法则与复合函数', ['求导法则', '复合函数求导', '链式法则', 'chain rule'], 'calculus-07'],
  ['calculus-extrema', 'calculus', '单调性、驻点与极值', ['函数单调性', '驻点', '函数极值', 'stationary point', 'local extrema'], 'calculus-08'],
  ['calculus-indefinite-integrals', 'calculus', '不定积分与换元', ['不定积分', '换元积分', 'indefinite integral', 'integration by substitution'], 'calculus-09'],
  ['calculus-definite-integrals', 'calculus', '定积分与有方向的积累', ['定积分', 'definite integral', '牛顿莱布尼茨', 'Newton-Leibniz'], 'calculus-10'],
  ['linear-dimensions', 'linear', '向量、矩阵与维度', ['线代', '线性代数', 'linear algebra', '矩阵维度', '向量维度', 'vector dimension'], 'linear-01'],
  ['linear-multiplication', 'linear', '矩阵乘法：行乘列', ['矩阵乘法', '行乘列', 'matrix multiplication'], 'linear-02'],
  ['linear-determinants', 'linear', '二阶与三阶行列式', ['行列式', 'determinant', 'Sarrus'], 'linear-03'],
  ['linear-determinant-properties', 'linear', '行列式性质与变换', ['行列式性质', '行列式变换', 'determinant properties'], 'linear-04'],
  ['linear-cofactors', 'linear', '余子式与代数余子式', ['余子式', '代数余子式', 'cofactor', 'matrix minor'], 'linear-05'],
  ['linear-inverses', 'linear', '逆矩阵与可逆条件', ['逆矩阵', '可逆矩阵', 'inverse matrix', 'invertible matrix'], 'linear-06'],
  ['linear-row-operations', 'linear', '初等行变换与阶梯形', ['初等行变换', '阶梯形', '行阶梯', 'row operation', 'row echelon'], 'linear-07'],
  ['linear-rank', 'linear', '矩阵的秩与解的数量', ['矩阵的秩', '矩阵秩', 'matrix rank', '方程组的解'], 'linear-08'],
  ['linear-cramer', 'linear', '克拉默法则及其前提', ['克拉默', '克莱姆', 'Cramer', "Cramer's rule"], 'linear-09'],
  ['linear-dependence', 'linear', '线性相关与线性变换', ['线性相关', '线性无关', '线性变换', 'linear dependence', 'linear transformation'], 'linear-10'],
];

export const TOPICS = Object.freeze(rows.map(([id, subject, title, keywords, lessonId]) => Object.freeze({ id, subject, title, keywords: Object.freeze(keywords), lessonIds: Object.freeze([lessonId]) })));
const topicMap = new Map(TOPICS.map(topic => [topic.id, topic]));

function isoTime(value, label, now) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${label}格式无效`);
  const calendarDay = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== value.slice(0, 10)) fail(`${label}日期不存在`);
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) fail(`${label}格式无效`);
  if (time.getTime() > now.getTime()) fail(`${label}不能是未来时间`);
  return time.toISOString();
}
function validNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('当前时间无效');
  return value;
}
function trustedFocus(topic) {
  return { topicId: topic.id, subject: topic.subject, title: topic.title, lessonIds: [...topic.lessonIds], reason: REASON };
}
function fingerprint(preferences, focus) {
  // Change detection only. This is not a security hash, nor a hash of the input text.
  const canonical = JSON.stringify({ preferences, topics: focus.map(x => x.topicId).sort() });
  let value = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) { value ^= canonical.charCodeAt(i); value = Math.imul(value, 0x01000193); }
  return `study-${(value >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeMemory(profile, { now = new Date() } = {}) {
  validNow(now);
  if (!isRecord(profile) || profile.format !== FORMAT || profile.version !== 1) fail('不支持此学习记忆格式或版本');
  if (!SOURCES.has(profile.source)) fail('学习记忆来源无效');
  const updatedAt = isoTime(profile.updatedAt, '整理时间', now);
  const sourceUpdatedAt = profile.sourceUpdatedAt == null ? null : isoTime(profile.sourceUpdatedAt, '来源更新时间', now);
  if (sourceUpdatedAt && sourceUpdatedAt > updatedAt) fail('来源更新时间不能晚于整理时间');
  const p = profile.preferences;
  if (!isRecord(p) || !['beginner', 'balanced'].includes(p.pace) || !['intuition-example-quiz', 'example-practice'].includes(p.method)) fail('学习偏好格式无效');
  const preferences = { pace: p.pace, method: p.method };
  if (!Array.isArray(profile.focus) || !profile.focus.length || profile.focus.length > TOPICS.length) fail('没有可识别的学习话题');
  const seen = new Set();
  const focus = profile.focus.map(item => {
    if (!isRecord(item) || typeof item.topicId !== 'string') fail('学习话题格式无效');
    const topic = topicMap.get(item.topicId);
    if (!topic || seen.has(topic.id)) fail('学习话题未知或重复');
    seen.add(topic.id);
    if (item.subject !== topic.subject || !Array.isArray(item.lessonIds) || item.lessonIds.length !== topic.lessonIds.length || item.lessonIds.some(id => !topic.lessonIds.includes(id)) || new Set(item.lessonIds).size !== item.lessonIds.length) fail('学习话题与学科课程不匹配');
    return trustedFocus(topic);
  }).sort((a, b) => TOPICS.findIndex(x => x.id === a.topicId) - TOPICS.findIndex(x => x.id === b.topicId));
  return { format: FORMAT, version: 1, source: profile.source, updatedAt, sourceUpdatedAt, fingerprint: fingerprint(preferences, focus), preferences, focus };
}

export const validateMemory = normalizeMemory;

function hasKeyword(text, keyword) {
  const key = keyword.toLowerCase();
  if (!/[\u3400-\u9fff]/u.test(key)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = /^[a-z0-9_]/i.test(key) ? '(^|[^a-z0-9_])' : '';
    const after = /[a-z0-9_]$/i.test(key) ? '(?=$|[^a-z0-9_])' : '';
    return new RegExp(`${before}${escaped}${after}`, 'i').test(text);
  }
  return text.includes(key);
}

export function parseMemoryText(text, { source = 'chatgpt-import', sourceUpdatedAt = null, now = new Date() } = {}) {
  validNow(now);
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) fail('学习记忆文本请控制在 200 KB 以内');
  if (!SOURCES.has(source)) fail('学习记忆来源无效');
  const normalizedText = text.normalize('NFKC').toLowerCase();
  const focus = TOPICS.filter(topic => topic.keywords.some(keyword => hasKeyword(normalizedText, keyword.normalize('NFKC')))).map(trustedFocus);
  if (!focus.length) fail('未识别到 C、Python、高数或线代的具体学习话题，请补充相关内容');
  const preferences = {
    pace: /零基础|初学|初学者|新手|从零|入门|先预习|beginner|from scratch/.test(normalizedText) ? 'beginner' : 'balanced',
    method: /直觉|先讲|先.*(?:概念|知识点|基础)|概念.*(?:例|练习)|预习|intuition/.test(normalizedText) ? 'intuition-example-quiz' : 'example-practice',
  };
  return normalizeMemory({ format: FORMAT, version: 1, source, updatedAt: now.toISOString(), sourceUpdatedAt, preferences, focus }, { now });
}

/** Known profile JSON is validated; unknown JSON is never treated as prose. */
export function importMemory(input, options = {}) {
  if (isRecord(input)) return normalizeMemory(input, options);
  if (typeof input !== 'string') fail('请选择学习记忆 JSON 或粘贴学习相关文字');
  if (new TextEncoder().encode(input).length > MAX_BYTES) fail('学习记忆文本请控制在 200 KB 以内');
  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch { fail('学习记忆 JSON 无法解析，请检查文件格式'); }
    return normalizeMemory(parsed, options);
  }
  let parsed, isJSON = false;
  try { parsed = JSON.parse(trimmed); isJSON = true; } catch { /* Ordinary prose is not JSON. */ }
  if (isJSON) return normalizeMemory(parsed, options);
  return parseMemoryText(input, options);
}
