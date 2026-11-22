# Build Pattern Recall

Make a small memory game in your browser. Three squares light up on a 3×3 grid for two seconds. When they turn off, click the squares you remember and check your answer. The order does not matter.

Work through one section at a time and test before moving on. If you plan to submit your version to Coral, use the examples to understand what each change does and write your version in a separate repo. Check the current rules for AI help and disclose the help you used as required.

## 1. Make the page

Create a folder called `pattern-recall` and open it in your editor. Create three files in that folder.

```text
pattern-recall/
  index.html
  style.css
  game.js
```

Start with this structure in `index.html`. Leave the other two files empty for now.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pattern Recall</title>
  <link rel="stylesheet" href="style.css">
  <script src="game.js" defer></script>
</head>
<body>
  <h1>Pattern Recall</h1>
  <p id="message" role="status">Press Show pattern to begin.</p>
  <button id="start" type="button">Show pattern</button>
  <button id="check" type="button" disabled>Check</button>
  <div id="board" role="group" aria-label="Memory grid"></div>
</body>
</html>
```

**Check:** Open `index.html` in your browser. You should see a heading, a message, and two buttons. Check is disabled. Keep this tab open and reload it after each edit.

## 2. Draw nine squares

Put this in `game.js`. The loop creates one button for each number from 1 through 9. The `cells` map lets the game find the button for a number later.

```js
const board = document.querySelector('#board')
const message = document.querySelector('#message')
const start = document.querySelector('#start')
const check = document.querySelector('#check')
const cells = new Map()

for (let number = 1; number <= 9; number++) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = number
  button.className = 'cell'
  button.setAttribute('aria-pressed', 'false')
  cells.set(number, button)
  board.append(button)
}
```

In `style.css`, give the board three equal columns. Try your own colors after the game works.

```css
body {
  font-family: system-ui, sans-serif;
  max-width: 32rem;
  margin: 2rem auto;
  padding: 0 1rem;
}

#board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 18rem;
  margin-top: 1rem;
}

.cell {
  aspect-ratio: 1;
  font: inherit;
  border: 2px solid #50616f;
  border-radius: 8px;
  background: #eef4f8;
  color: #17242e;
}

.cell.lit { background: #f8c66e; }
.cell.chosen { background: #a8d4ff; }
.cell.correct { background: #a6e2b2; }
.cell.missed { border-style: dashed; }
.cell.wrong { background: #ffc4bd; }
```

**Check:** Reload. You should see three rows of three buttons. Press Tab to see the focus move through the board.

## 3. Flash a fixed pattern

Append this to the bottom of `game.js`. Start with a pattern you know so it's easy to tell if the code works. The `phase` variable describes what the player can do at each point in the round.

```js
let pattern = [1, 5, 9]
let phase = 'ready'
const guesses = new Set()

function startRound() {
  guesses.clear()
  phase = 'showing'
  start.disabled = true
  check.disabled = true
  message.textContent = 'Remember the highlighted squares.'

  for (const [number, button] of cells) {
    button.className = 'cell'
    button.textContent = number
    button.setAttribute('aria-pressed', 'false')
    button.classList.toggle('lit', pattern.includes(number))
  }

  setTimeout(() => {
    for (const button of cells.values()) button.classList.remove('lit')
    phase = 'guessing'
    message.textContent = 'Select the three squares you remember.'
  }, 2000)
}

start.addEventListener('click', startRound)
```

**Check:** Press Show pattern. Only 1, 5, and 9 should light up. They should go back to their normal color after two seconds. At this point, reload to try another round.

## 4. Let the player select squares

Append this to `game.js`. A `Set` stores each selected number only once. Clicking a selected square a second time removes it.

```js
board.addEventListener('click', event => {
  const button = event.target.closest('.cell')
  if (!button || phase !== 'guessing') return

  const number = Number(button.textContent)
  if (guesses.has(number)) {
    guesses.delete(number)
  } else {
    if (guesses.size === pattern.length) return
    guesses.add(number)
  }

  const selected = guesses.has(number)
  button.classList.toggle('chosen', selected)
  button.setAttribute('aria-pressed', String(selected))
  check.disabled = guesses.size !== pattern.length
  message.textContent = `${guesses.size} of ${pattern.length} selected.`
})
```

**Check:** Try clicking while the pattern is showing. Nothing should be selected. When the pattern disappears, select three squares. Check should enable. Deselect one and it should disable again.

## 5. Check the answer and replay

Append one more click handler. Use `pattern.includes(number)` to ask whether a square was part of the original pattern. Compare that with `guesses.has(number)` to decide what to display.

```js
check.addEventListener('click', () => {
  if (phase !== 'guessing' || guesses.size !== pattern.length) return
  phase = 'finished'
  const correct = pattern.filter(number => guesses.has(number)).length

  for (const [number, button] of cells) {
    const inPattern = pattern.includes(number)
    const selected = guesses.has(number)
    button.classList.remove('chosen')
    button.classList.toggle('correct', inPattern && selected)
    button.classList.toggle('missed', inPattern && !selected)
    button.classList.toggle('wrong', selected && !inPattern)
    if (inPattern || selected) {
      const result = inPattern ? (selected ? 'correct' : 'missed') : 'wrong'
      button.textContent = `${number} · ${result}`
    }
  }

  message.textContent = `You found ${correct} of ${pattern.length} squares.`
  check.disabled = true
  start.disabled = false
  start.textContent = 'Play again'
  start.focus()
})
```

**Check:** Select 1, 2, and 5. The result should say you found two of three. Square 2 should be marked wrong and 9 missed. Play again and select 9, 5, and 1. That should score three of three.

## 6. Generate a different challenge each round

Add this function below `const guesses = new Set()` and above `startRound`. It removes each pick from the list, so the same square cannot come up twice in a round.

```js
function makePattern() {
  const options = [...cells.keys()]
  const picks = []

  for (let count = 0; count < 3; count++) {
    const index = Math.floor(Math.random() * options.length)
    const [number] = options.splice(index, 1)
    picks.push(number)
  }

  return picks
}
```

Inside `startRound`, add `pattern = makePattern()` right after `guesses.clear()`. You can now change the initial `let pattern = [1, 5, 9]` to `let pattern = []`.

**Check:** Play five rounds. Each round should show exactly three distinct squares. Occasionally the same combination can come up again by chance. Finish a round using only Tab and Enter.

## 7. Make it yours and prepare to share

- Change the title and colors. Give the game one feature you designed yourself, such as a harder mode that shows four squares or a streak counter.
- Test a correct answer, a wrong answer, Play again, and the layout on a narrow screen.
- Create a README in your game repo. Explain the rules, how to open the game, and what you learned. Add a screenshot from your own browser.
- Save working milestones as commits. For each devlog, describe a real change or bug you fixed and include a screenshot when it helps.

### If something breaks

Open the browser developer tools and look in the **Console**. Start with the first error. If it says a value is `null`, check that the selector in `game.js` matches the ID in `index.html`. If a change does not appear, save the file and reload. If you're stuck, write down what you expected, what actually happened, and the smallest piece of code involved.
