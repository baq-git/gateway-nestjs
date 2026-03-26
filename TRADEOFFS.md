# ARCHITECTURE:
1. Idempotency & State Machine 
- Main flow: Idempotency is a technique that allows a client to retry a request if it fails. It is used to ensure that a request is not processed multiple times, even if the client retries the request. Idempotency keys are used to identify a request and prevent it from being processed multiple times. The server generates an idempotency key and includes it in the request. The client includes the idempotency key in the request to ensure that the request is not processed multiple times. The server checks the idempotency key and processes the request only if it matches the key. (AI generated this common terms)
- In my codebase, I use an interceptor to check idempotency key and throw error early if it is not valid. Then It checks whether the key is duplicate and responds the cached body. If not, it return the `handle()`. Handle is where our service working.

- We can see the graph below:

# TESTING:
1. use jest + better-sqlite3 inmemory database

2. from this point, we are not using the same database for testing and production,change from timestamp to date because of timezone issue when testing. But if it is scaled globally, it will be a problem so for testing purpose and learning purpose, we can use datetime type.


tradeoffs:

thực tế saveResponse là nơi kỳ vọng rằng tất cả các flow từ lúc idempotencyKey được tạo đến payment service sẽ dùng chung queryRunner, handle rollback khi xảy ra lỗi hệ thống đến từ bên thứ 3 hoặc do Database hoặc đường truyền, v.v (dạng lỗi server 500 error - tôi cần thảo luận với bạn) ???
nên trong paymentService, khi thực thi authorize hoặc consume statemachine, nếu xảy ra lỗi thì interceptor catch error và rollback tại đó, tuy nhiên, idempotency vẫn là một service mà tại đó catch lỗi và save vào db response failure cho trường hơp concurent call sau này

saveResponse nằm trong transaction chính (chung queryRunner với toàn bộ flow từ createOrLock → PaymentService → saveResponse).
saveError được gọi sau rollback (tách transaction, dùng connection riêng hoặc sau khi tx đã rollback).


Thiết kế hiện tại (sau khi bạn cải thiện saveError) hoàn toàn dùng được cho production early-stage, đặc biệt khi:

Traffic chưa cao
Bạn ưu tiên atomic success và rollback business an toàn
Bạn chấp nhận retry transient phải dùng key mới

Nó tốt hơn rất nhiều so với không có idempotency, và an toàn hơn hầu hết các implementation MVP mà mình từng thấy.
Nếu sau này thấy retry transient quan trọng hơn (client retry tự động khi 500), bạn mới cần nâng cấp lên:

Redis cho idempotency (lock nhanh, TTL tự động)
Outbox pattern cho payment events

Hiện tại → giữ nguyên và tiếp tục implement PaymentService đi, bạn đã có nền tảng idempotency khá vững.
