# Simple performance benchmark

This example provides a simple performance benchmark where 1 client application makes thousands of parallel requests to 1 or 3 server applications.

## Running

With 1 server application:
```
$ npm run example:performance:n1
```

With 3 server applications:
```
$ npm run example:performance:n3
```
Note: Peformance bottleneck here is the single client.