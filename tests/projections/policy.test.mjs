import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studyPolicy } from './policy.mjs';
const summary = { scoringGaps: ['st_td','fum_rec_td'], window: {fromWeek:8,throughWeek:17} };
test('declares exclusions and keeps study horizon separate from championship',()=>{
  const policy=studyPolicy(summary);
  assert.equal(policy.fullLeagueScoring,false);
  assert.equal(policy.championshipVerified,false);
  assert.equal(policy.verdictInfluence,false);
  assert.equal(policy.exclusions.length,2);
});
test('unknown scoring cannot silently enter an approximate result',()=>{
  assert.throws(()=>studyPolicy({...summary,scoringGaps:['bonus_rec_te']}),/requires review/);
  assert.throws(()=>studyPolicy({...summary,scoringGaps:undefined}),/metadata/);
});
test('study labels follow supplied bounds rather than hardcoded week 17',()=>{
  assert.equal(studyPolicy({...summary,window:{fromWeek:10,throughWeek:16}}).windowLabel,'Weeks 10–16');
  assert.throws(()=>studyPolicy({...summary,window:{fromWeek:17,throughWeek:8}}),/window/);
});
