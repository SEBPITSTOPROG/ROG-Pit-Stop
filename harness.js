const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Executa a pagina real em um DOM (jsdom) com relogio, requestAnimationFrame
// e setTimeout controlados, para inspecionar a sessao quadro a quadro.
const PAGE = path.join(__dirname, 'pit_stop_rog.html');
const HTML = fs.readFileSync(PAGE, 'utf8');

function boot(opts = {}) {
  const state = { t: 0, queue: [], nextId: 1, speech: [], cancels: 0, rafRegistered: 0 };

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    beforeParse(win) {
      // jsdom nao deixa substituir window.performance inteiro (accessor read-only),
      // entao sobrescrevemos apenas o metodo now.
      Object.defineProperty(win.performance, 'now', {
        value: () => state.t * 1000,
        configurable: true,
        writable: true
      });

      win.requestAnimationFrame = cb => {
        const id = state.nextId++;
        state.queue.push({ id, cb });
        state.rafRegistered++;
        return id;
      };
      win.cancelAnimationFrame = id => {
        state.queue = state.queue.filter(f => f.id !== id);
      };

      if (!opts.noSpeech) {
        win.SpeechSynthesisUtterance = function (text) { this.text = text; };
        win.speechSynthesis = {
          getVoices: () => [{ lang: 'pt-BR', name: 'fake-br' }],
          cancel: () => { state.cancels++; },
          speak: u => {
            if (opts.speakThrows) throw new Error('audio device failure');
            state.speech.push({ t: +state.t.toFixed(2), text: u.text });
          }
        };
      }

      state.timers = [];
      win.setTimeout = (cb, ms) => {
        const id = state.nextId++;
        state.timers.push({ id, due: state.t + (ms || 0) / 1000, cb });
        return id;
      };
      win.clearTimeout = id => { state.timers = state.timers.filter(t => t.id !== id); };

      win.AudioContext = function () {
        return {
          currentTime: 0,
          createOscillator: () => ({
            type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {}, start() {}, stop() {}
          }),
          createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
          destination: {}, close() {}
        };
      };
    }
  });

  state.dom = dom;
  state.win = dom.window;
  return state;
}

// advance the clock, flushing rAF callbacks exactly like a browser would
function tick(state, seconds, step = 1 / 60) {
  const end = state.t + seconds;
  while (state.t < end - 1e-9) {
    state.t = Math.min(end, state.t + step);
    const dueTimers = (state.timers || []).filter(x => x.due <= state.t + 1e-9);
    state.timers = (state.timers || []).filter(x => x.due > state.t + 1e-9);
    dueTimers.forEach(x => x.cb());

    if (state.frozen) continue;
    const due = state.queue;
    state.queue = [];
    due.forEach(f => f.cb(state.t * 1000));
  }
}

function snap(state) {
  const d = state.win.document;
  const g = id => d.getElementById(id);
  const zone = g('breathZone');
  return {
    screen: ['screenStart', 'screenExperience', 'screenFinish'].find(id => g(id).classList.contains('active')),
    phase: g('phase').textContent,
    instruction: g('instruction').textContent,
    count: g('breathCount').textContent,
    copy: g('breathCopy').textContent,
    zone: [...zone.classList].filter(c => c !== 'breath-zone').join(',') || '(none)',
    stepDur: zone.style.getPropertyValue('--step-dur') || '(none)',
    progress: g('progress').style.width,
    timer: g('timer').textContent,
    beginBtn: g('beginBtn').textContent.trim()
  };
}

const results = [];
function check(label, cond, detail = '') {
  results.push({ label, pass: !!cond, detail });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  -> ' + detail : ''));
}

// ===================================================================== TEST 1
console.log('\n=== 1. INICIO: selecao de condicao e arranque ===');
let s = boot();
let doc = s.win.document;

check('abre na tela inicial', snap(s).screen === 'screenStart', snap(s).screen);
doc.getElementById('beginBtn').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
check('sem condicao selecionada, nao inicia', snap(s).screen === 'screenStart', 'btn="' + snap(s).beginBtn + '"');

doc.querySelector('.option[data-state="pressao"]').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
check('opcao marcada como selected', doc.querySelector('.option[data-state="pressao"]').classList.contains('selected'));
check('CTA vira "Iniciar protocolo"', snap(s).beginBtn === 'Iniciar protocolo', snap(s).beginBtn);
check('marca de telemetria recebe o estado', doc.getElementById('experienceMark').classList.contains('pressao'));

doc.getElementById('beginBtn').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
check('vai para a tela da sessao', snap(s).screen === 'screenExperience', snap(s).screen);
check('cronometro inicia em 01:00', snap(s).timer === '01:00', snap(s).timer);

// ===================================================================== TEST 2
console.log('\n=== 2. SESSAO COMPLETA DE 60 s (amostragem a cada 1/60 s) ===');
const transitions = [];
let prevKey = null;
const drift = [];

for (let i = 0; i < 60 * 60; i++) {
  tick(s, 1 / 60);
  const v = snap(s);
  const key = v.zone + '|' + v.instruction + '|' + v.phase;
  if (key !== prevKey) {
    transitions.push({ t: +s.t.toFixed(3), zone: v.zone, instruction: v.instruction, phase: v.phase, count: v.count, dur: v.stepDur, copy: v.copy });
    prevKey = key;
  }
  // cronometro x tempo real
  if (v.timer && v.screen === 'screenExperience') {
    const shown = 60 - (parseInt(v.timer.slice(0, 2)) * 60 + parseInt(v.timer.slice(3)));
    drift.push(Math.abs(shown - s.t));
  }
}

transitions.forEach(x => console.log('  t=' + String(x.t).padEnd(7) + ' ' + x.zone.padEnd(9) + ' ' + x.instruction.padEnd(20) + ' ' + x.phase.padEnd(14) + ' n=' + x.count + ' dur=' + x.dur));

const at = t => transitions.find(x => Math.abs(x.t - t) < 0.02);
check('0 s -> preparacao (prestart)', transitions[0].zone === 'prestart' && transitions[0].count === '3', transitions[0].count);
check('3 s -> respiracao natural', at(3) && at(3).zone === 'natural', at(3) && at(3).zone);
check('8 s -> inicio do guiado (inspirar 3 s)', at(8) && at(8).zone === 'inhale' && at(8).dur === '3s', at(8) && at(8).dur);
check('11 s -> expirar 4 s', at(11) && at(11).zone === 'exhale' && at(11).dur === '4s', at(11) && at(11).dur);
check('15 s -> pausa 1 s', at(15) && at(15).zone === 'pause' && at(15).dur === '1s', at(15) && at(15).dur);
check('56 s -> volta a respiracao natural', at(56) && at(56).zone === 'natural', at(56) && at(56).zone);

const cycleStarts = transitions.filter(x => x.zone === 'inhale');
check('exatamente 6 ciclos guiados', cycleStarts.length === 6, cycleStarts.length + ' ciclos');
check('ciclos a cada 8 s', cycleStarts.every((c, i) => Math.abs(c.t - (8 + i * 8)) < 0.02), cycleStarts.map(c => c.t).join(', '));
check('rotulos "Ciclo N de 6" corretos', cycleStarts.every((c, i) => c.phase === 'Ciclo ' + (i + 1) + ' de 6'), cycleStarts.map(c => c.phase).join(' / '));
const pauses = transitions.filter(x => x.zone === 'pause');
check('pausa sem texto de apoio na tela', pauses.length === 6 && pauses.every(p => p.copy === ''),
  pauses.length + ' pausas, textos: ' + JSON.stringify(pauses.map(p => p.copy)));
check('cronometro nunca desvia mais de 1 s do relogio', Math.max(...drift) < 1.001, 'desvio max ' + Math.max(...drift).toFixed(3) + ' s');

tick(s, 1 / 60);
const fin = snap(s);
check('aos 60 s vai para a tela final', fin.screen === 'screenFinish', fin.screen);
check('barra em 100%', fin.progress === '100%', fin.progress);
check('cronometro em 00:00', fin.timer === '00:00', fin.timer);
check('marcador final e o check', fin.count === '\u2713', JSON.stringify(fin.count));
check('nenhum rAF pendente apos o fim', s.queue.length === 0, s.queue.length + ' pendentes');

// ===================================================================== TEST 3
console.log('\n=== 3. FALAS DISPARADAS ===');
s.speech.forEach(x => console.log('  t=' + String(x.t).padEnd(7) + ' "' + x.text + '"'));
const texts = s.speech.map(x => x.text);
check('fala de abertura em t=0', s.speech[0] && s.speech[0].t < 0.05);
check('"Inspirar" falada nos 6 ciclos', texts.filter(t => t === 'Inspirar').length === 6,
  texts.filter(t => t === 'Inspirar').length + 'x');
check('"Expirar" falada nos 6 ciclos', texts.filter(t => t === 'Expirar').length === 6,
  texts.filter(t => t === 'Expirar').length + 'x');
check('nenhuma fala usa os textos de apoio da tela',
  !texts.some(t => /recupere o foco|reduza o ru/i.test(t)), texts.join(' | '));
check('a pausa nao e narrada', !texts.some(t => /pausa/i.test(t)), texts.join(' | '));
check('total de falas na sessao = 14 (abertura + 6x2 + encerramento)', s.speech.length === 14,
  s.speech.length + ' falas');
const inspirarTimes = s.speech.filter(x => x.text === 'Inspirar').map(x => x.t);
const expirarTimes = s.speech.filter(x => x.text === 'Expirar').map(x => x.t);
check('"Inspirar" no inicio de cada inspiracao (8, 16, 24, 32, 40, 48 s)',
  [8, 16, 24, 32, 40, 48].every((exp, i) => Math.abs(inspirarTimes[i] - exp) <= 0.025),
  inspirarTimes.join(', '));
check('"Expirar" no inicio de cada expiracao (11, 19, 27, 35, 43, 51 s)',
  [11, 19, 27, 35, 43, 51].every((exp, i) => Math.abs(expirarTimes[i] - exp) <= 0.025),
  expirarTimes.join(', '));

// ===================================================================== TEST 4
console.log('\n=== 4. REINICIO ===');
doc.getElementById('againBtn').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
let v = snap(s);
check('"Fazer novamente" volta ao inicio', v.screen === 'screenStart', v.screen);
check('painel resetado (contagem 3 / 01:00 / 0%)', v.count === '3' && v.timer === '01:00' && v.progress === '0%', [v.count, v.timer, v.progress].join(' '));
check('zona de respiracao sem classes de etapa', v.zone === '(none)', v.zone);

doc.querySelector('.option[data-state="presente"]').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
doc.getElementById('beginBtn').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
tick(s, 2);
v = snap(s);
check('2a sessao recomeca a contagem do zero', v.zone === 'prestart' && ['1','2'].includes(v.count), v.zone + ' n=' + v.count);
check('apenas um laco de animacao ativo', s.queue.length === 1, s.queue.length + ' laços');

console.log('\n--- reinicio no meio da sessao (botao "Reiniciar") ---');
tick(s, 20);
const midProgress = parseFloat(snap(s).progress);
doc.getElementById('restartBtn').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
v = snap(s);
check('reinicio no meio zera a barra', parseFloat(v.progress) === 0, 'antes ' + midProgress.toFixed(1) + '% -> agora ' + v.progress);
check('nao acumula lacos de animacao', s.queue.length === 1, s.queue.length + ' laços');
tick(s, 1.2);
check('contagem reinicia em 2 apos 1,2 s', snap(s).count === '2', snap(s).count);
tick(s, 60);
check('sessao reiniciada chega a tela final', snap(s).screen === 'screenFinish', snap(s).screen);

// ===================================================================== TEST 5
console.log('\n=== 5. SESSAO COM AUDIO QUEBRADO ===');
const broken = boot({ speakThrows: true });
let bdoc = broken.win.document;
bdoc.querySelector('.option[data-state="acelerado"]').dispatchEvent(new broken.win.MouseEvent('click', { bubbles: true }));
bdoc.getElementById('beginBtn').dispatchEvent(new broken.win.MouseEvent('click', { bubbles: true }));
tick(broken, 61);
let bv = snap(broken);
check('speak() lancando erro nao trava a sessao', bv.screen === 'screenFinish', bv.screen);
check('sessao encerra com 00:00 mesmo sem voz', bv.timer === '00:00', bv.timer);

const mute = boot({ noSpeech: true });
let mdoc = mute.win.document;
mdoc.querySelector('.option[data-state="presente"]').dispatchEvent(new mute.win.MouseEvent('click', { bubbles: true }));
mdoc.getElementById('beginBtn').dispatchEvent(new mute.win.MouseEvent('click', { bubbles: true }));
tick(mute, 61);
let mv = snap(mute);
check('sem API de voz no navegador, sessao roda igual', mv.screen === 'screenFinish', mv.screen);

// ===================================================================== TEST 6
console.log('\n=== 6. ABA EM SEGUNDO PLANO (quadros congelados) ===');
const bg = boot();
const bgdoc = bg.win.document;
bgdoc.querySelector('.option[data-state="pressao"]').dispatchEvent(new bg.win.MouseEvent('click', { bubbles: true }));
bgdoc.getElementById('beginBtn').dispatchEvent(new bg.win.MouseEvent('click', { bubbles: true }));
tick(bg, 10);
check('sessao andando antes de congelar', snap(bg).zone === 'inhale' || snap(bg).zone === 'exhale', snap(bg).zone);
bg.frozen = true;                    // navegador para de emitir quadros
tick(bg, 55);
check('encerra no tempo mesmo sem quadros', snap(bg).screen === 'screenFinish', snap(bg).screen);
bg.frozen = false;
tick(bg, 2);
check('nao reabre nem duplica o encerramento', snap(bg).screen === 'screenFinish' && snap(bg).timer === '00:00', snap(bg).screen + ' ' + snap(bg).timer);

// ===================================================================== RESUMO
const failed = results.filter(r => !r.pass);
console.log('\n===== ' + (results.length - failed.length) + '/' + results.length + ' verificacoes aprovadas =====');
failed.forEach(f => console.log('  FALHOU: ' + f.label + ' -> ' + f.detail));
console.log('\nNAO COBERTO AQUI: sincronia visual da animacao CSS e qualquer validacao de audio.');
process.exit(failed.length ? 1 : 0);
