/* Verificacao pontual (nao faz parte da suite jsdom): abre pit_stop_rog.html em
   Chromium real e mede o diametro renderizado de .core em instantes fixos da
   sessao, para confirmar que a animacao CSS acompanha visualmente a linha do
   tempo (algo que jsdom nao consegue validar, pois nao executa animacao).

   A espera de cada instante usa a barra de progresso da propria pagina como
   relogio de referencia (em vez de so um wall-clock externo): isso evita
   amostrar poucas dezenas de ms antes de uma transicao de fase, o que faria
   a leitura mostrar a fase anterior por coincidencia de arredondamento. */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const CHROME_PATH = '/opt/pw-browsers/chromium';
const PAGE_URL = 'file://' + path.join(__dirname, 'pit_stop_rog.html');
const OUT_DIR = path.join(__dirname, 'screenshots');
const CONDITION = 'pressao'; // "Sob pressão" -> opção usada para disparar o protocolo

const TARGETS = [1, 4, 8, 9.5, 11, 13, 15, 15.5, 32, 55.5, 57, 60.5];

function fileName(t) {
  return 't-' + t.toFixed(1).padStart(4, '0') + 's.png';
}

function ensureDisplay() {
  if (process.env.DISPLAY) return null;
  const display = ':99';
  const xvfb = spawn('Xvfb', [display, '-screen', '0', '1280x1024x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  process.env.DISPLAY = display;
  return xvfb;
}

async function readElapsed(page) {
  return page.evaluate(() => {
    const w = parseFloat(document.getElementById('progress').style.width) || 0;
    return (w / 100) * 60;
  });
}

// Espera ate a pagina reportar (via barra de progresso) que chegou no instante
// alvo. O relogio interno (performance.now() dentro da pagina) comeca a
// contar um pouco depois do nosso t0 no Node (o clique so e' processado no
// navegador antes do Node terminar de aguardar a acao), entao o relogio
// externo fica sistematicamente um pouco a frente do interno durante a
// sessao — por isso so usamos o relogio externo como fallback depois que a
// barra de progresso ja estabilizou em 60s/100% (sessao encerrada).
async function waitForInstant(page, t0, target) {
  for (;;) {
    const elapsed = await readElapsed(page);
    if (elapsed >= 59.999) {
      const wall = (Date.now() - t0) / 1000;
      if (wall >= target) return { elapsed, wall };
    } else if (elapsed >= target - 0.002) {
      return { elapsed, wall: (Date.now() - t0) / 1000 };
    }
    await page.waitForTimeout(10);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const xvfb = ensureDisplay();
  if (xvfb) await new Promise(resolve => setTimeout(resolve, 400));

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: false, // com display real, o compositor emite quadros continuamente
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-ipc-flooding-protection'
    ]
  });

  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
    await page.goto(PAGE_URL);

    await page.click(`.option[data-state="${CONDITION}"]`);

    const t0 = Date.now();
    await page.click('#beginBtn');

    const rows = [];

    for (const target of TARGETS) {
      const { elapsed, wall } = await waitForInstant(page, t0, target);

      const info = await page.evaluate(() => {
        const core = document.querySelector('.core');
        const rect = core ? core.getBoundingClientRect() : null;
        const activeScreen = ['screenStart', 'screenExperience', 'screenFinish']
          .map(id => document.getElementById(id))
          .find(el => el && el.classList.contains('active'));
        const zone = document.getElementById('breathZone');
        return {
          width: rect ? rect.width : null,
          height: rect ? rect.height : null,
          instruction: document.getElementById('instruction') ? document.getElementById('instruction').textContent : null,
          count: document.getElementById('breathCount') ? document.getElementById('breathCount').textContent : null,
          phase: document.getElementById('phase') ? document.getElementById('phase').textContent : null,
          zoneClass: zone ? [...zone.classList].filter(c => c !== 'breath-zone').join(',') : null,
          screen: activeScreen ? activeScreen.id : null
        };
      });

      const file = fileName(target);
      await page.screenshot({ path: path.join(OUT_DIR, file) });

      rows.push({ target, elapsed, wall, file, ...info });
      console.log(
        'alvo=' + target + 's  elapsed(interno)=' + elapsed.toFixed(3) + 's  wall=' + wall.toFixed(3) + 's -> ' +
        'diam=' + (info.width != null ? info.width.toFixed(2) : info.width) +
        'x' + (info.height != null ? info.height.toFixed(2) : info.height) +
        '  zone=' + info.zoneClass +
        '  instr="' + info.instruction + '"' +
        '  count=' + info.count +
        '  screen=' + info.screen
      );
    }

    const lines = [];
    lines.push('# Medições visuais — `.core` em pit_stop_rog.html');
    lines.push('');
    lines.push('Gerado por `visual-sync-check.js` (Playwright + Chromium real, com display via Xvfb — não jsdom).');
    lines.push('');
    lines.push('Condição operacional selecionada: **' + CONDITION + '** ("Sob pressão").');
    lines.push('');
    lines.push('| Instante alvo (s) | Instante interno medido (s) | Diâmetro `.core` (px) | Zona (`breathZone`) | Instrução | Contador | Fase | Tela ativa | Captura |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const diam = (r.width != null)
        ? r.width.toFixed(2) + ' × ' + r.height.toFixed(2)
        : '(sem elemento visível)';
      lines.push(
        '| ' + r.target +
        ' | ' + r.elapsed.toFixed(3) +
        ' | ' + diam +
        ' | ' + r.zoneClass +
        ' | ' + r.instruction +
        ' | ' + r.count +
        ' | ' + r.phase +
        ' | ' + r.screen +
        ' | `' + r.file + '` |'
      );
    }

    fs.writeFileSync(path.join(OUT_DIR, 'medicoes.md'), lines.join('\n') + '\n');
    console.log('\nSalvo em screenshots/medicoes.md');
  } finally {
    await browser.close();
    if (xvfb) xvfb.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
