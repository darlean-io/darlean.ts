# Canonical

Darlean Canonical is a library for representing structured data in a typed manner, in such a way that it can be consumed in multiple programming languages.

The library contains a generic data type (the `ICanonical`) which is a bit like a variant in that it is a container for primitive and structured values.

A canonical has the following properties:
 * It has a *physical type*. The physical type is the type used to physically store (or serialize) the data. Examples of physical types are strings, numbers,
   booleans, objects, arrays, Buffers and Dates.
* It has a *logical type*. The logical type describes what kind of data is represented. Examples of logical types are `first-name`, `last-name`, `postal-address`
  and `list-of-people`.
* It has a value of the corresponding physical type.

Although canonicals can be combined very well with value objects that make them even more type-safe (as found in package] `@darlean/valueobjects`), and can be serialized to verious
formats (like the one from package `@darlean/canonical-json`), canonicals themselves have nothing to do this with. They are just an in-memory representation of a value with an
associate physical and logical type.