To educate and entertain, we have created some examples that you can look at and play with.

# Example 1: Tutorial. A distributed oracle.

In this tutorial, we will show you the basics of actor oriented programming with Darlean by making a distributed oracle to which we can ask whatever we'd like to know, like "What is the temperature of tomorrow?"
or "How much does a bottle of wine cost?".

* Part 1: [The basics](src/oracle/1_the_basics) - A basic oracle using virtual actor technology
* Part 2: [Oracle as a Service](src/oracle/2_oracle_as_a_service) - Service actors to hide implementation details from the application
* Part 3: [Do not forget](src/oracle/3_do_not_forget) - Persistence to remember learned facts
* Part 4: [Scale it up!](src/oracle/4_scale_it_up) - Transform into a client-server setup with multiple server applications for unmatched scalability and availability
* Part 5: [Follow me](src/oracle/5_follow_me) - What if a single actor is the bottleneck? The multi-follower pattern.
* Part 6: [Wait a while](src/oracle/6_wait_a_while) - Use of long polling to improve responsiveness

Please follow the above links for more information about each of the parts. Or, skip all of that, dive into the code, and directly get going with the following command right from the root of this monorepo after a fresh pull from git:
```
$ npm run install-workspaces
$ npm run example:oracle:all -w examples
```

# Example 2: A performance benchmark.

A rudimentary [performance benchmark](src/performance) on two deployment setups:
* One client and one server node, all running on one computer
* One client and 3 server nodes, all running on one computer

Can be started (from the root of this monorepo) with:
* `$ npm run example:performance:all -w examples` to run all performance tests
* `$npm run example:performance:n1 -w examples` to run the performance test on a cluster with 1 client node and 1 server node
* `$npm run example:performance:n3 -w examples` to run the performance test on a cluster with 1 client node and 3 server nodes

Expected reported performance numbers are > 4000 actor invocations per second.

Note that there is no significant performance difference between the 2 deployment setups, because the limiting factor here is the single client node.