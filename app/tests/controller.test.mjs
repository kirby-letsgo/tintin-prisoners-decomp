import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPad, ControllerTracker} from '../src/lib/controller.ts';
const pad=(pressed=[],axes=[0,0],extra={})=>({index:0,id:'test',connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i),value:pressed.includes(i)?1:0})),...extra});
test('standard controls include simultaneous movement and A/B, Start and Select',()=>{
 assert.equal(readPad(pad([0,1,8,9,12,15])).buttons,16|32|64|128|4|1);
 assert.equal(readPad(pad([],[-0.8,0.9])).buttons,2|8);
 assert.equal(readPad(pad([],[0.2,-0.3])).buttons,0);
 assert.equal(readPad(pad([12,13,14,15])).buttons,0);
});
test('menu button is separate from game Start and fires once per press',()=>{
 const t=new ControllerTracker();t.sample([pad()]);
 assert.equal(t.sample([pad([4,9])]).menu,true);
 assert.equal(t.sample([pad([4,9])]).menu,false);
 assert.equal(t.sample([pad([9])]).buttons,128);
 assert.equal(t.sample([pad([4])]).menu,true);
});
test('connecting with held buttons does not click a menu; disconnect clears input',()=>{
 const t=new ControllerTracker();
 assert.equal(t.sample([pad([0])]).confirm,false);
 t.sample([pad()]);assert.equal(t.sample([pad([0])]).confirm,true);
 const lost=t.sample([]);assert.equal(lost.disconnected,true);assert.equal(lost.buttons,0);assert.equal(lost.connected,false);
 assert.equal(t.sample([]).disconnected,false);
 assert.equal(t.sample([pad([0])]).confirm,false);
});
test('stable controller ownership, switching, and unsupported mappings',()=>{
 const t=new ControllerTracker();const other=pad([1],[],{index:1,id:'other'});
 t.sample([null,other]);assert.equal(t.sample([pad([0]),other]).buttons,32);
 const switched=t.sample([pad([0])]);assert.equal(switched.disconnected,true);assert.equal(switched.confirm,false);
 assert.equal(new ControllerTracker().sample([pad([0],[],{mapping:''})]).connected,false);
});
