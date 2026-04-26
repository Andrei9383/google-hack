# Project Aura Presentation

This folder contains a print-ready HTML slide deck for Project Aura.

## Files

- `aura-deck.html` - editable 16:9 presentation deck with visual placeholders
- `aura-deck.pdf` - generated export, if Chromium is available locally

## Export To PDF

Open `aura-deck.html` in a browser and print with:

- Layout: landscape
- Paper size: 16:9, or use default if the browser respects the deck page size
- Margins: none
- Background graphics: enabled

Command-line export:

```bash
chromium-browser --headless --disable-gpu --no-sandbox \
  --print-to-pdf=presentation/aura-deck.pdf \
  --print-to-pdf-no-header \
  file:///home/andrei/google-hackathon-2/presentation/aura-deck.html
```

## Replacing Placeholders

Search for `placeholder` in `aura-deck.html`. Each placeholder is a normal HTML block, so you can replace it with an `<img>` tag:

```html
<img src="screenshots/android-status.png" alt="Android status screen" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">
```
