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

## Installation

```
npm install @darlean/canonical-json
```

## Usage

### Serialization

```ts
import { ArrayCanonical, BinaryCanonical, BoolCanonical, DictCanonical, FloatCanonical, IntCanonical, MomentCanonical, StringCanonical} from '@darlean/canonical';
import { CanonicalJsonDeserializer, CanonicalJsonSerializer } from '../canonical-json';

const struct = DictCanonical.from(
    {
        'first-name': StringCanonical.from('Jantje', ['name', 'first-name']),
        'last-name': StringCanonical.from('DeBoer', ['last-name']),
        'age': IntCanonical.from(21, ['age-in-years']),
        'whisdom': ArrayCanonical.from(
            [BoolCanonical.from(true, ['fact']), BoolCanonical.from(false, ['fact'])],
            ['facts']
        ),
        'length': FloatCanonical.from(180.5, ['meters']),
        'born': MomentCanonical.from(new Date('2000-12-31T18:30:00.000Z'), ['birthday']),
        'data': BinaryCanonical.from(Buffer.from('BINARY'), ['binary-data'])
    },
    ['person']
);

const serializer = new CanonicalJsonSerializer();
const binary = serializer.serialize(struct);
```

This results in the following JSON:
```json
{
    "type": "person",
    ":first-name": "Jantje (name.first-name s)",
    ":last-name": "DeBoer (last-name s)",
    ":age": "21 (age-in-years i)",
    ":whisdom": [
      "facts",
      "true (fact b)",
      "false (fact b)"
    ],
    ":length": "180.5 (meters f)",
    ":born": "978287400000 (birthday m)",
    ":data": "QklOQVJZ (binary-data 6)"
}
```

### Deserialization

Serialized data can be deserialized as follows:

```ts
const deserializer = new CanonicalJsonDeserializer();
const canonical = deserializer.deserialize(binary);
const struct2 = canonical.asDict();

console.log(struct2['first-name'].stringValue);  // Prints "Jantje"
console.log(struct2['first-name'].logicalTypes); // Prints "['name', 'first-name']"
```

## Value objects

To simplify working with canonical objects, consider the use of value objects:
