# Voice control model

`asr-zipformer-en-20M/` is the English streaming speech-recognition model
`sherpa-onnx-streaming-zipformer-en-20M-2023-02-17` by the k2-fsa / Next-gen Kaldi team
(Apache License 2.0), from
<https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models>.

Only the int8 encoder/decoder/joiner (renamed without their `-epoch-99-avg-1` suffix) and
`tokens.txt` are kept. What the app listens for is in `src/shared/voiceCommands.ts`.

The app loads the model in `src/main/voice/worker.ts` (ARCHITECTURE §2, "voice").
