# Voice control model

`kws-zipformer-gigaspeech-3.3M/` is the English keyword-spotting model
`sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` by the k2-fsa / Next-gen Kaldi team
(Apache License 2.0), from
<https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models>.

Only the int8 encoder/decoder/joiner (renamed without their `-epoch-12-avg-2-chunk-16-left-64`
suffix), `tokens.txt` and `bpe.model` are kept. The app needs only the first four;
`bpe.model` is what `tools/voice/tokenize.py` uses to spell a new phrase in the model's
tokens. The phrases are listed in `src/shared/voiceCommands.ts`.

The app loads the model in `src/main/voice/worker.ts` (ARCHITECTURE §2, "voice").
