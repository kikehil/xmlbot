const { chromium } = require('playwright');

async function checkHiddenErrors() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to SAT login page...');
    await page.goto('https://portalcfdi.facturaelectronica.sat.gob.mx/', {
      timeout: 45000,
      waitUntil: 'load'
    });

    // Wait 5 seconds
    await page.waitForTimeout(5000);

    // Check if "Captcha no válido" text is in the HTML code (visible or hidden)
    const html = await page.content();
    console.log('Contains "Captcha no válido" initially:', html.includes('Captcha no válido'));
    console.log('Contains "RFC o contraseña no válido" initially:', html.includes('RFC o contraseña no válido'));

    // Let's find any elements containing these texts and print their tag/class/display properties
    const errorElements = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      return allElements
        .filter(el => el.textContent && (el.textContent.includes('Captcha no válido') || el.textContent.includes('RFC o contraseña no válido')))
        .map(el => ({
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          style: el.getAttribute('style'),
          visible: el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0,
          textContent: el.textContent.substring(0, 100)
        }));
    });

    console.log('--- FOUND ERROR ELEMENTS IN DOM ---');
    console.log(JSON.stringify(errorElements, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

checkHiddenErrors();
