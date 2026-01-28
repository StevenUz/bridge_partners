// Unit tests for bridge auction logic
import {
  CallType,
  DetermineAuctionResult,
  DetermineContract,
  DetermineDeclarer,
  DetermineOpeningLeader
} from './auction.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Test 1: Passed Out
const calls1 = [
  {type: CallType.PASS, seat: 'N'},
  {type: CallType.PASS, seat: 'E'},
  {type: CallType.PASS, seat: 'S'},
  {type: CallType.PASS, seat: 'W'}
];
assert(DetermineAuctionResult(calls1, 'N').result === 'PassedOut', 'Test 1 failed');

// Test 2: 1S - Pass - 2H - Pass - Pass - Pass
const calls2 = [
  {type: CallType.BID, level: 1, strain: 'S', seat: 'N'},
  {type: CallType.PASS, seat: 'E'},
  {type: CallType.BID, level: 2, strain: 'H', seat: 'S'},
  {type: CallType.PASS, seat: 'W'},
  {type: CallType.PASS, seat: 'N'},
  {type: CallType.PASS, seat: 'E'}
];
const res2 = DetermineAuctionResult(calls2, 'N');
assert(res2.result === 'Contract', 'Test 2 result');
assert(res2.contract.level === 2 && res2.contract.strain === 'H', 'Test 2 contract');
assert(res2.contract.doubled === 'None', 'Test 2 doubled');
assert(res2.declarer === 'S', 'Test 2 declarer');
assert(res2.dummy === 'N', 'Test 2 dummy');
assert(res2.openingLeader === 'W', 'Test 2 opening leader');

// Test 3: 1NT - Pass - 3NT - Pass - Pass - Double - Pass - Pass - Pass
const calls3 = [
  {type: CallType.BID, level: 1, strain: 'NT', seat: 'E'},
  {type: CallType.PASS, seat: 'S'},
  {type: CallType.BID, level: 3, strain: 'NT', seat: 'W'},
  {type: CallType.PASS, seat: 'N'},
  {type: CallType.PASS, seat: 'E'},
  {type: CallType.DOUBLE, seat: 'S'},
  {type: CallType.PASS, seat: 'W'},
  {type: CallType.PASS, seat: 'N'},
  {type: CallType.PASS, seat: 'E'}
];
const res3 = DetermineAuctionResult(calls3, 'E');
assert(res3.result === 'Contract', 'Test 3 result');
assert(res3.contract.level === 3 && res3.contract.strain === 'NT', 'Test 3 contract');
assert(res3.contract.doubled === 'Doubled', 'Test 3 doubled');
assert(res3.declarer === 'E', 'Test 3 declarer');
assert(res3.dummy === 'W', 'Test 3 dummy');
assert(res3.openingLeader === 'S', 'Test 3 opening leader');

console.log('All auction logic tests passed.');
