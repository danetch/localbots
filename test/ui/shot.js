// Dev tool (not part of npm test): screenshots of the renderer with a mocked window.api. Usage: node test/ui/shot.js <empty|top|drop|bis> [width] [height] [full]  (needs playwright; DARK=1 for dark mode)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined }).catch(async()=>chromium.launch());
  const p = await b.newPage({ colorScheme: process.env.DARK ? 'dark' : 'light', viewport: { width: +process.argv[3] || 1440, height: +process.argv[4] || 900 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => m.type()==='error' && console.log('CONSOLE', m.text()));
  await p.addInitScript({ path: __dirname + '/mock.js' });
  await p.goto('file://' + require('path').resolve(__dirname, '../../renderer/index.html')); await p.waitForTimeout(500);
  const step = process.argv[2] || 'empty';
  if (step !== 'empty') {
    await p.fill('#txt', 'warrior="Bob"\nspec=fury\nlevel=90\nhead=,id=10\n# Helm B (300)\n# head=,id=20\n');
    await p.dispatchEvent('#txt', 'input'); 
    if (step === 'drop') await p.click('input[value=drop]'); if (step === 'bis') await p.click('input[value=bis]');
    await p.click('#go'); await p.waitForTimeout(400);
  }
  await p.screenshot({ path: __dirname + `/${step}-${process.argv[3]||1440}.png`, fullPage: process.argv[5]==='full' });
  await b.close();
})();
