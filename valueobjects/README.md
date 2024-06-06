# Package @darlean/valueobjects

## Introduction

ValueObjects is a package for working with value objects. Value objects represent immutable values that:
* are easily validated to ensure validity; 
* are both physically and logically typed to ensure integrity;
* can be serialized without loss of physical and logical type info;
* can seemlessly be used from other languages in their own native naming conventions.

## Installation
```
npm install @darlean/valueobjects
```

## Example
```ts
// Type definitions with some interitance and validation:

@stringvalue class Name extends StringValue { name: discriminative }
@stringvalue class FirstName extends Name { first_name: discriminative }
@stringvalue class LastName extends StringValue { last_name: discriminative }

@intvalidation((v) => v >= 0, 'Must not be negative')
@intvalue class Age extends IntValue { age: discriminative }

@boolvalue class Fact extends BoolValue { fact: discriminative }

@floatvalue class Meters extends FloatValue { meters: discriminative }

@momentvalue class Birthday extends MomentValue { birthday: discriminative }

@binaryvalue class BinaryData extends BinaryValue { binary_data: discriminative }

@typedarrayvalue(Fact) class Facts extends ArrayValue<Fact> { facts: discrimninative }

@objectvalue() class Person extends ObjectValue {
    get firstName() { return FirstName.required() }
    get lastName() { return LastName.required() }
    get age() { return Age.optional() }
    get facts() { return Facts.required() }
    get length() { return Meters.required() }
    get born() { return Birthday.required() }
    get data() { return BinaryData.required() }
}

// Creating value objects:
const p = Person.from({
    firstName: FirstName.from('Jantje'),
    lastName: LastName.from('DeBoer'),
    age: Age.from(21),
    length: Meters.from(180.5),
    facts: Facts.from([true, Fact.from(false)]),
    born: Birthday.from(new Date('2000-12-31T18:30:00.000Z')),
    data: BinaryData.from(Buffer.from('BINARY'))
});

// Using value objects:
expect(p.firstName.value).toBe('Jantje');
expect(p.firstName instanceof FirstName).toBe(true);
expect(p.lastName.value).toBe('DeBoer');
expect(p.age.value).toBe(21);
expect(p.facts.length).toBe(2);
expect(p.facts.getTyped(0).value).toBe(true);
expect(p.facts.getTyped(1).value).toBe(false);
expect(p.length.value).toBe(180.5);
expect(p.born.value.toISOString()).toBe('2000-12-31T18:30:00.000Z');
expect(p.data.value.toString()).toBe('BINARY');
```

## Physical types

Value objects have a physical type and a logical type. The physical type defines how it is represented in memory (like string or boolean). The logical type
defines what role it has (like a first-name or a last-name).

The following physical types are supported. Within brackets are the corresponding native typescript types:
* Strings - Represent a piece of unicode text. (`string`)
* Integers - Represent an integer number. (`number`)
* Floats - Represent a floating point number. (`float`)
* Booleans - Represent a boolean value (`boolean`)
* Moments - Represent one specific moment in time (`Date`)
* Binary - Represent binary data (`Buffer`)
* Sequences - Represent an array (`[]`)
* Objects - Represent objects with fields of data (`{}`)

## Logical types

Besides physical types, value objects also have a logical type. A logical type indicates which role a value object has in an
application. Is a string a first-name, a last-name, an url, or a piece of proza?

Logical names can only contain characters `a`-`z`, `0`-`9` and `-` in order to achieve cross-language compatibility. Unless explicitly specified, 
the logical name of a value object is automatically derived from the corresponding class names by replacing capitals with `-` plus the lowercase
character.

Logical names can form a hierarchy. A first-name can be a name, for example. So, value objects can have more than one logical name. They are then
represented as a dot-separated string: `name.first-name`. The full logical name is always kept with the value object, even when an application only
understands a part of the logical name.

## Validation

Value objects can perform validation. Validation ensures they are never constructed with invalid data. To add validation, apply one of the
validation decorators:

```ts
@stringvalidation((v) => v.length > 5, 'Must have minimum length')
class Name extends StringValue { name: discriminative }

@intvalidation((v) => v >= 0, 'Must not be negative')
class Age extends IntValue { age: discriminative }

@boolvalidation((v) => v === true, 'Must always be true')
class Fact extends BoolValue { fact: discriminative }

@floatvalidation((v) => v > 0.90, 'Must be long enough')
@floatvalidation((v) => v < 2.50, 'Must not be too tall')
@floatvalue class Meters extends FloatValue { meters: discriminative }

@momentvalidation((v) => v.getMonth === 11, 'Must be in december')
@momentvalue class Birthday extends MomentValue { birthday: discriminative }

@binaryvalidation((v) => v.length < 100_000>, 'Must be less than 100.000 bytes')
@binaryvalue class BinaryData extends BinaryValue { binary_data: discriminative }
```

Notes:
* When you apply a validation decorator, the default decorator (`@stringvalue`, `@intvalue`, etc) can be omitted.
* Multiple validations can be applied by adding multiple decorators
* Validations of a parent value object are always run before the validations of a child object. The standard types
  already check that the value is not undefined, and that the value is of the correct physical type. So, validation
  logic can safely assume that the received value is defined and of the expected type.
* It's up to you whether to spell the checks out explitly (`v >= 0`) or to use a fancy validation library for that.
  We prefer simplicity, readability and explicitability, but it's entirely up to you!

## Valilla JS without decorators

For use without typescript, it is possible to work without decorators. Please see the tests for examples.

## Object values

To make defining objects and their fields as simple as possible, we use a clever (but dirty) trick.

Let's take the following value object as an example:

```ts
@objectvalue() class Person extends ObjectValue {
    get firstName() { return FirstName.required() }
    get age() { return Age.optional() }
}
```

The getter implementations (`return FirstName.required()`) play a double role:
* During class definition, the `@objectvalue` decorator invokes each getter once. The getter
  returns an internally used object that describes whether the field is optional and what the
  type of the field is.
* Also during class definition, the same `@objectvalue` decorator silently replaces the current getter
  implementation with a new one that does actually return the corresponding field value.

So, when you request `somePerson.age`, javascript does not run your getter (`return Age.optional()`), but it
will invoke the replaced getter stub that will fetch the proper value and return it.

## Structural typing

Javascript is a nominally-typed (aka duck-typed) language. And typescripts mimics that.

This means that:
```ts
class A { firstName?: string; }
class B { firstName?: string; }
const a: A = new B()
```
will compile because A and B look the same.

For use with value objects, this is an undesirable property. The whole goal of defining separate `FirstName` and
`LastName` types is to avoid mistakes like the following:
```ts
function makeFullName(firstName: FirstName, lastName: LastName) {
  return [firstName.value, lastName.value].join(' ');
}
makeFullName(LastName.from('Brown'), FirstName.from('Alice'));
```

This can be prevented by adding a dummy field with a unique name (we suggest to take the classname for that) with the
type of `discriminative` (which simply is undefined, but for understandability of the code, we have given it a more
descriptive name):
```ts
@stringvalue class FirstName extends StringValue { first_name: discriminative }
@stringvalue class LastName extends StringValue { last_name: discriminative }
```

This is enough to trick TypeScript that the objects are really distinct. Note that the extra field does not incur any
runtime performance overhead, as the undefined value is not really created during runtime.

## Single inheritance

Struct values purposely have single inheritance. A person-with-age can descend from a plain person, but not from both
a person and an employee. Our rationale for this is:
* Not all languages support this construct. We want to be a cross-language toolkit.
* It is complex to implement and to understand.
* It is not necessary. When you need the concept that someone is a person and an employee, we believe it is much simpler
  and cleaner to just define a struct that combines the two.

Instead of using multiple interitance, create a new struct that combines the two concepts:

```ts
@objectvalue() class EmployeePerson extends ObjectValue {
    get person() { return Person.required() }
    get employee() { return Employee.required() }
}
```

## Serialization

Serialization is not one of the core functionalities of value objects, so serialization is provided in a different
package. Package `@darlean/canonical-json` provides serialization to a json-compatible format with type information
embedded.

## Canonicals

Value objects are backed by canonicals (see `@darlean/canonical`). Value objects are in essence a developer-friendly (and type-safe) way of working
with canonicals. Value objects can be loaded from (via the static `.from` methods) and converted to canonicals without loss of data.

## Unknown struct fields

It is possible that struct value objects contain fields that are not understood by a certain application. For example, application A could define
a subclass B of A, which has additional fields B1 and B2. When serialized and sent to application A, A would not know fields B1 and B2. Depending
on the decoration options for a struct, these fields are internally kept (as generic canonicals), and included in a later serialization so that
the values are not lost.

The default value is that struct values throw an error on unknown fields. This ensures that any spelling errors on field names are detected. To
change this behaviour, set the unknownFieldAction to `keep`, `ignore` or `error`. 

## Advantages

Although they are very useful in DDD, they also offer a lot of benefits for non-DDD applications:
* Value objects are a huge time saver:
  * Use the same data types in the frontend, backend, in the persistence, over the wire, and anywhere you like.
  * When you have  the same programming language in all of your components (like TypeScript in both frontend and backend), you 
    only have to define your data types once and use them everywhere.
  * Eliminate all those annoying conversions from frontend to http, from http to dao, from dao to domain object and from domain object to persistence.
    Use the same types everywhere. Automatic validation ensures no one can tamper with your data.
  * Speak your domain language all over your application. Most frontends are tightly coupled with the backend in terms of functionality.
    Why bother with creating a beautiful highly official REST api in between when no external party will ever use that? Directly
    invoke your business logic services from your frontend with a minimal layer of HTTP in between. You can always create the formal REST api
    later when you actually need to connect other parties (yagni).
* Value objects make your code more robust and secure
  * Continous validation means that your value objects are validated at every stage of your processing pipeline. When created at the frontend
    based on user-provided input data; when they arrive at your HTTP gateway; when they are forwarded to your domain services; when they are
    loaded from persistance; when they are received by the frontend.
  * Because of continuous validation, you can be sure that the value object behaves as you expect. When you add a validation rule that when
    there is a postcode, there must also be a non-empty street name, you can be sure that when you have a postcode, you also have a non-empty
    street name. No need to check for that, and no risk of running into unexpected situations when it does occur.

## Characteristics

Value objects have the following characteristics:
* Immutability. Once created, value objects cannot be changed.
* Validatability. During creation, value objects are validated. When validation fails, an error is thrown and no value
  object is returned. Because value objects are immutable, you can be sure that once created, they will always be valid.
* Serializable. Value objects can be serialized from and to multiple formats (including json) without loss of data. This
even supports primitive types like moments and binary data.
* Interoperability. Serialized value objects are compatible across platforms and programming languages.

## How it works

You create value objects from native types (string, booleans, objects, arrays, and so on) by calling their static `from` method:
```
const myName = StringValue.from('Alice');
const myAge = IntValue.from(42);
```

Once created, you can extract the physical value by means of `.value`:
```
console.log(`My name is ${myName.value} and I am ${myAge.value} years old);
```

Value objects have basic validation built in:
```
IntValue.from(42.5);                   // Boom! Exception: 42.5 is a float, not an integer
IntValue.from('I am not an integer');  // Boom! Exception: A string is not an integer.
IntValue.from(undefined);              // Boom! Exception: Undefined is not a valid integer.
``` 

And you can easily add your own validation by adding custom types:
```
@stringvalidator((v) => (v.length >= 2), 'Must at least contain 2 characters')
@stringvalidator((v) => (v.toLowerCase() !== v), 'Must have at least one uppercase character')
export class FirstName extends StringValue {}
```

Or, in vanilla JS without decorators:
```
export class FirstName extends StringValue {}
stringv(FirstName, 'first-name')
  .withValidator((v) => (v.length >= 2), 'Must at least contain 2 characters');
  .withValidator((v) => (v.toLowerCase() !== v), 'Must have at least one uppercase character');
```

```
const myName = FirstName.from('Alice');   // Ok
const myName = FirstName.from('A');       // Boom! Exception: Must at least contain 2 characters
const myName = FirstName.from('alice');   // Boom! Exception: Must have at least one uppercase character
```

So, what do we see here?
* We create a definition for class FirstName by means of `stringv`. This indicates that first name is a string.
* The canonical name is set to `first-name`. A canonical name is the name that is used for this field when serializing.
  To achieve smooth cross-language interoperability, canonical names can only contain lowercase `'a'-'z'`, `'0'-'9'` and the dash `'-'`.
* We add a 2 validators that check whather a name has at least 2 characters, and must at least have one uppercase character. Otherwise we consider it not a valid first name.

# TODO

All of the below mentioned topics are not yet documented.

## Structures

## Arrays

## Serialization

## Canonical model

## Thoughts
 * Wil je een Voornaam object kunnen toekennen aan een veld van type LastName? Verhoogt kans op fouten wanneer je argumenten husselt.
 * Kan een object meerdere types hebben? Een boek heeft een titel; een uitleenbaar object een prijs. Een uitleenbaar-boek heeft allebei.
   Of is dat een struct die een boek en een uitleenbaar veld heeft? DIT LAATSTE want de andere optie is te complex.
   * Als een object meerdere types heeft: Hoe omgaan wanneer de target niet alle types ondersteunt?
   * typecheck: wordt complex!! Minstens 1 matchen? Of mag 0 ook? En bij 1: welke dan? Eerste? Willekeurige?
     * do-not-check--keep-missing
     * do-not-ignore-all
     * ignore-unsupported
     * keep-missing