#!/usr/bin/env node
/**
 * Headless screenshot tool for visual debugging.
 * Launches Vite dev server, opens the game in headless Chrome,
 * navigates through UI, and takes screenshots at key moments.
 *
 * Usage: node scripts/screenshot.mjs [--action=fight|idle|title]
 */

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots');

// Parse args
const args = process.argv.slice(2);
const actionArg = args.find(a => a.startsWith('--action='));
const action = actionArg ? actionArg.split('=')[1] : 'fight';
const waitTime = parseInt(args.find(a => a.startsWith('--wait='))?.split('=')[1] || '3000');

// Ensure screenshot directory
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

async function startVite() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5199'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let output = '';
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
    proc.stdout.on('data', (data) => {
      output += data.toString();
      const clean = stripAnsi(output);
      if (clean.includes('Local:')) {
        const match = clean.match(/http:\/\/[^\s]+/);
        if (match) resolve({ proc, url: match[0] });
      }
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    setTimeout(() => reject(new Error('Vite start timeout. Output:\n' + stripAnsi(output))), 15000);
  });
}

async function takeScreenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`Screenshot saved: ${filepath}`);
  return filepath;
}

async function main() {
  console.log('Starting Vite dev server...');
  const { proc: viteProc, url } = await startVite();
  console.log(`Vite ready at ${url}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
      defaultViewport: { width: 1280, height: 720 },
    });

    const page = await browser.newPage();

    // Collect console logs
    const logs = [];
    page.on('console', (msg) => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      logs.push(`[ERROR] ${err.message}`);
    });

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000)); // Wait for Three.js init

    // Screenshot 1: Title screen
    await takeScreenshot(page, '01_title');

    if (action === 'title') {
      console.log('Done (title only).');
      printLogs(logs);
      return;
    }

    // Press Enter to get past "PRESS ENTER TO BEGIN"
    console.log('Pressing Enter to start...');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 1000));
    await takeScreenshot(page, '02_after_enter');

    // Character select is now visible — click FIGHT directly (VS COMPUTER is default)
    await takeScreenshot(page, '02_char_select');

    console.log('Clicking FIGHT...');
    const fightClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent.toUpperCase().includes('FIGHT')) {
          btn.click();
          return btn.textContent;
        }
      }
      return false;
    });

    if (!fightClicked) {
      console.log('Could not find FIGHT button.');
      printLogs(logs);
      return;
    }
    console.log(`Clicked: "${fightClicked}"`);

    // Wait for match to load and round intro
    console.log(`Waiting ${waitTime}ms for match to start...`);
    await new Promise(r => setTimeout(r, waitTime));
    await takeScreenshot(page, '03_fight_start');

    // Wait a bit more for the round intro to finish
    await new Promise(r => setTimeout(r, 2000));
    await takeScreenshot(page, '04_fighting');

    if (action === 'fight') {
      // Try pressing D to move forward, then screenshot
      console.log('Pressing D (move toward opponent)...');
      await page.keyboard.down('KeyD');
      await new Promise(r => setTimeout(r, 1000));
      await takeScreenshot(page, '05_moving_forward');
      await page.keyboard.up('KeyD');

      // Try pressing W to sidestep
      console.log('Pressing W (sidestep)...');
      await page.keyboard.down('KeyW');
      await new Promise(r => setTimeout(r, 1000));
      await takeScreenshot(page, '06_sidestep');
      await page.keyboard.up('KeyW');

      // Try attacking (J key)
      console.log('Pressing J (attack)...');
      await page.keyboard.press('KeyJ');
      await new Promise(r => setTimeout(r, 500));
      await takeScreenshot(page, '07_attack');
      await new Promise(r => setTimeout(r, 1000));
      await takeScreenshot(page, '08_after_attack');
    }

    printLogs(logs);
    console.log('\nAll screenshots saved to: screenshots/');

  } finally {
    if (browser) await browser.close();
    viteProc.kill();
  }
}

function printLogs(logs) {
  if (logs.length > 0) {
    console.log('\n--- Browser Console Logs ---');
    for (const log of logs.slice(-50)) {
      console.log(log);
    }
  }
}

main().catch((err) => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
