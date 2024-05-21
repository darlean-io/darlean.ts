# Package @darlean/canonical-json

Darlean Canonical JSON provides a serialization format for canonical values. It can be used together with the @darlean/canonical and
@darlean/valueobjects packages.

The serialization produces valid JSON that looks very much like regular JSON.

The differences are:
* All primitive data types are represented as string. After the string representation of the value, a type annotation follows between brackets `(` and `)`.
  The type annotation contains the physical type and the logical type.
* Mappings are represented as objects. A special entry called `type` is added for the typer annotation. To avoid confusion, all other map keys are prefixed with 
  a colon `:`.
* Sequences are represented as arrays. The first array element contains the type annotation.

