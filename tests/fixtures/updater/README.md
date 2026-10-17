# Updater verification fixture

`update-fixture.bin` is harmless text, never an installer. Its public detached
signature is made with this project's updater identity for version `99.0.0`.
The opt-in desktop harness serves it on loopback, verifies its download, then
corrupts one byte and checks that signature verification rejects it. It never
runs the payload. No private signing material is included here.
