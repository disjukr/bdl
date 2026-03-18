# BDL Project Structure

A single BDL project consists of a configuration file that points to BDL packages, a package directory containing multiple modules, and individual module files within it.

Module files have the `.bdl` extension and are written in the BDL language.

Paths declared in `bdl.yaml`, including package directories and custom
standard files, are resolved relative to the directory that contains the config
file.

You can check the BDL language in the [syntax](./syntax.md) documentation.
