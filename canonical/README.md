# Canonical

Darlean Canonical is a library for representing structured data, in such a way that it can be consumed natively in multiple programming languages,
and with preservation of both physical type (like string, number, boolean) and logical type (like first-name, last-name, age).

The library contains a generic data type (the `ICanonical`) which is a container for logically and physically typed primitive and structured values.

A canonical has the following properties:
 * It has a *physical type*. The physical type is the type used to physically store (or serialize) the data. Examples of physical types are strings, numbers,
   booleans, objects, arrays, Buffers and Dates.
* It has a *logical type*. The logical type describes what kind of data is represented. Examples of logical types are `first-name`, `last-name`, `postal-address`
  and `list-of-people`.
* It has a value of the corresponding physical type.

Although canonicals can be combined very well with value objects that make them even more type-safe (as found in package] `@darlean/valueobjects`), and can be serialized to verious
formats (like the one from package `@darlean/canonical-json`), canonicals themselves have nothing to do this with. They are just an in-memory representation of a value with an
associate physical and logical type.

## Serialization

Canonicals can be serialized to various formats. Currently, the only known implementation is the one provided by `@darlean/canonican-json`. As the name implies, it converts
canonical data to a valid JSON document with embedded type annotations.

## Supported physical types

Canonicals support the following physical types. The native representation in TypeScript and JavaScript is shown in brackets.
* String - To contain unicode text (`string`).
* Int - To contain positive or negative integer numbers (`number`).
* Float - To contain floating point numbers (`number`).
* Boolean - To contain true/false booleans. (`boolean`)
* Binary - To contain an array of bytes (`Buffer`)
* Moment - To contain a specific moment in time (`Date`)
* Sequence - To contain an ordered sequence of canonicals (`[...]`)
* Mapping - To contain a key-value mapping from string keys to canonical values. (`{...}`)
* None - To indicate that there is no value (only useful in sequences). (`undefined`)

Notes:
* How these physical types are represented in a serialized format depends on the specific serialization definition. That is out of scope
  for the concept of canonicals as defined in this package.
* How these physical types are represented in memory depends on the library for the specific programming language. It is in general
  most convenient to stay close to the native data types that are supported by a language.