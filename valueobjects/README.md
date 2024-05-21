# Package @darlean/valueobjects

## Introduction

ValueObjects is a package for working with value objects. Value objects are well known from the Domain Driven Design (DDD)
architectural pattern and represent immutable data, such as phone numbers, streets and addresses.

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
Our value objects have the following characteristics:
* Immutability. Once created, value objects cannot be changed.
* Validatability. During creation, value objects are validated. When validation fails, an error is thrown and no value
  object is returned. Because value objects are immutable, you can be sure that once created, they will always be valid.
* Serializable. Value objects can be serialized from and to multiple formats (including json) without loss of data. This
even supports primitive types like moments and binary data.
* Interoperability. Serialized value objects are compatible across platforms and programming languages.

## How it works

You create value objects by calling their constructor:
```
const myName = new StringValue('Alice');
const myAge - new IntValue(42);
```

Once created, you can extract the value by means of `.value`:
```
console.log(`My name is ${myName.value} and I am ${myAge.value} years old);
```

Nothing exciting, except that it is quite some work. And that the objects are read-only.

The power comes in when we try to trick our software with illegal input (either because of a programming mistake, or by an attacker 
that is trying to forge us by providing invalid input):
```
new IntValue(42.5);                   // Boom! Exception.
new IntValue('I am not an integer');  // Boom! Exception.
new IntValue(undefined);              // Boom! Exception.
``` 

It has validation built in. But the real power emerges when you define your own types:
```
// In vanilla JS without decorators:
export class FirstName extends StringValue {}
stringv(FirstName, 'first-name')
  .withValidator((value) => (value.length >= 2), 'Must at least contain 2 characters');
  .withValidator((value) => (value.toLowerCase() !== value), 'Must have at least one uppercase character');

// In TypeScript with decorators:
@stringvalidator((value) => (value.length >= 2), 'Must at least contain 2 characters')
@stringvalidator((value) => (value.toLowerCase() !== value), 'Must have at least one uppercase character')
export class FirstName extends StringValue {}
```

```
const myName = new FirstName('Alice');   // Ok
const myName = new FirstName('A');       // Boom! Exception.
const myName = new FirstName('alice');   // Boom! Exception.
```

So, what do we see here?
* We create a definition for class FirstName by means of `stringv`. This indicates that first name is a string.
* The canonical name is set to `first-name`. A canonical name is the name that is used for this field when serializing.
  To achieve smooth cross-language interoperability, canonical names can only contain lowercase `'a'-'z'`, `'0'-'9'` and the dash `'-'`.
* We add a 2 validators that check whather a name has at least 2 characters, and must at least have one uppercase character. Otherwise we consider it not a valid first name.

## Structures

## Arrays

## Serialization

## Canonical model

## Casting & Duck Typing

Warning: DOSomethingWith(FirstName) accepts a LastName because of duck typing.

=> Discriminators

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