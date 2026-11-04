r"""
Spells a voice-control phrase in the keyword model's word pieces, for src/shared/voiceCommands.ts.

    py -3 -m venv %TEMP%\stp-voice-venv
    %TEMP%\stp-voice-venv\Scripts\python -m pip install sentencepiece
    %TEMP%\stp-voice-venv\Scripts\python tools/voice/tokenize.py "show movepool" "show trainers"

prints, for each phrase, the `tokens` to paste:

    { keyword: "...", said: "show movepool", tokens: "▁SHOW ▁MO VE PO OL" },

Spell letters as separate words ("show i v s"), the way they are said. Output is written as
UTF-8 even in a console that isn't (the "▁" is not in cp1252).
"""
import sys
from pathlib import Path

import sentencepiece as spm

MODEL = Path(__file__).resolve().parents[2] / "resources" / "voice" / "kws-zipformer-gigaspeech-3.3M" / "bpe.model"

if len(sys.argv) < 2:
    sys.exit(__doc__)

sp = spm.SentencePieceProcessor(model_file=str(MODEL))
out = open(sys.stdout.fileno(), "w", encoding="utf-8", closefd=False)
for phrase in sys.argv[1:]:
    tokens = " ".join(sp.encode(phrase.upper(), out_type=str))
    out.write(f'{{ keyword: "...", said: "{phrase}", tokens: "{tokens}" }},\n')
