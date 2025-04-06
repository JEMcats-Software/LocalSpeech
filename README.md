![LocalSpeech Logo](./assets/icon.png)
# LocalSpeech
LocalSpeech by JEMcats-Software aims to read text for you locally without using any cloud based processing. Currently we are offering a pre built DMG for MacOS with Apple Silicon.

## To-Do List
- [ ] Figure Out Compiling The Sherpa-Onnx Exec For ARM64
- [ ] Add PDF Reader
- [ ] Add Window Support
- [ ] Add MacOS Intel Support
- [ ] Add Exec Compiler Workflow
- [x] Launch v1.0.0 Beta

## Support
For questions open a discussion.

For support, reports, or requests open an issue.

## Usage
You **MUST** have Rosetta installed if you are on a Mac with Apple Silicon. To do so please run this command in terminal.
```
/usr/sbin/softwareupdate --install-rosetta
```

## Contributing
Fork the ``dev`` branch.

Make your changes in your fork.

Fill out the pull request form.

Open a pull request.

## License
This project is licensed under the GPL-3.0 license.

You may:
- Modify and redistribute the code,
- Only if you keep it open-source and GPL-licensed,
- Provide credit to the original author (JEMcats-Software).

No closed-source forks or redistributions allowed.

## Credits

- [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) (The runtime that make this possible)
- [kokoro-multi-lang-v1_0](https://huggingface.co/csukuangfj/kokoro-multi-lang-v1_0) (The model used to produce voices)