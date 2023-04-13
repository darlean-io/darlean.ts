# Distributed Oracle - Part 7 - Exposure is everything!

In [Part 6](../6_wait_a_while/) of this tutorial, we more or less finished our oracle. We used a NodeJS client application to test the oracle from within our cluster. But that's not enough. We also want *external* applications or webapps to be able to access our oracle.

It is not safe to have external applications connect via the message bus. They could easily perform a Denial of Service attack, or access information they should not see. Only trusted (internal) applications should directly connect via the message bus.

The prefered way of connecting external applications to a Darlean cluster is by means of a web api. Application make http(s) calls to a Darlean web service. The service invokes the underlying actors, and returns the result as a http response.

TODO: Finish this tutorial