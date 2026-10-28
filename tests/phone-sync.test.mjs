import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePhoneMemoryState} from '../dist/phone-sync.mjs';
import {emptyState} from '../dist/core.mjs';
import {parseMemoryText} from '../dist/study-memory.mjs';

test('phone memory sync preserves all existing study data and changes only memory plus its local auto-sync setting',()=>{
  const state=emptyState();state.completed['c-01']='2026-10-27';state.dailyDone['2026-10-27']=['c-01'];state.reviews['c-01']={due:'2026-10-28',interval:1,streak:0,lastGrade:'new'};state.quiz['c-01']={answer:2,correct:true,at:Date.parse('2026-10-27T12:00:00Z')};state.notes=[{id:'note-preserve',title:'保留的笔记',body:'这份笔记不是同步内容',tags:['知识点'],createdAt:Date.parse('2026-10-27T12:00:00Z')}];state.customResources=[{id:'resource-preserve',title:'课程资料',url:'https://example.com/',category:'课程'}];state.sessions=[{date:'2026-10-27',minutes:25}];state.settings.goal=45;
  const original=JSON.stringify(state),profile=parseMemoryText('C语言素数与高数陪域。');const result=preparePhoneMemoryState(original,profile);
  for(const key of ['completed','dailyDone','reviews','quiz','notes','customResources','sessions'])assert.deepEqual(result[key],state[key]);
  assert.equal(result.settings.goal,45);assert.equal(result.settings.memoryAutoSync,false);assert.equal(result.memory.fingerprint,profile.fingerprint);assert.equal(JSON.stringify(state),original);
});
test('corrupt existing records stop phone sync instead of replacing them with an empty state',()=>{
  const profile=parseMemoryText('C语言素数');assert.throws(()=>preparePhoneMemoryState('{broken',profile),/已停止同步/);assert.throws(()=>preparePhoneMemoryState(JSON.stringify({completed:{'c-01':'not-a-date'}}),profile),/已停止同步/);assert.ok(preparePhoneMemoryState(null,profile).memory);
});
