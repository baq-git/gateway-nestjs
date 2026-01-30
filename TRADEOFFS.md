# ARCHITECTURE:
1. Idempotency & State Machine 
- Main flow: Idempotency is a technique that allows a client to retry a request if it fails. It is used to ensure that a request is not processed multiple times, even if the client retries the request. Idempotency keys are used to identify a request and prevent it from being processed multiple times. The server generates an idempotency key and includes it in the request. The client includes the idempotency key in the request to ensure that the request is not processed multiple times. The server checks the idempotency key and processes the request only if it matches the key. (AI generated this common terms)
- In my codebase, I use an interceptor to check idempotency key and throw error early if it is not valid. Then It checks whether the key is duplicate and responds the cached body. If not, it return the `handle()`. Handle is where our service working.

- We can see the graph below:

# TESTING:
1. use jest + better-sqlite3 inmemory database

2. from this point, we are not using the same database for testing and production,change from timestamp to date because of timezone issue when testing. But if it is scaled globally, it will be a problem so for testing purpose and learning purpose, we can use datetime type.


