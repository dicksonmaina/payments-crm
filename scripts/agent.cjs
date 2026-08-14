#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')

function run(cmd, opts = {}) {
  try { return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: 'pipe', ...opts }).trim() }
  catch (e) { return null }
}

function status() {
  console.log('=== payments-crm Status ===\n')
  
  const git = run('git status --short')
  const branch = run('git branch --show-current')
  const commit = run('git log -1 --oneline')
  
  console.log('Git branch:', branch || 'none')
  console.log('Last commit:', commit || 'none')
  console.log('Changes:', git ? git.split('\n').length : 0)
}

function analyze() {
  console.log('=== payments-crm Analysis ===\n')
  console.log('Run: npm run build && npm run lint')
}

function improve() {
  console.log('=== Improvement Suggestions ===\n')
  console.log('1. Add tests')
  console.log('2. Add CI/CD')
  console.log('3. Add documentation')
}

const cmd = process.argv[2]
if (cmd === 'status') status()
else if (cmd === 'analyze') analyze()
else if (cmd === 'improve') improve()
else {
  console.log('Usage: node scripts/agent.cjs <command>')
  console.log('Commands: status, analyze, improve')
  process.exit(1)
}
