# Enum cast

Casts an enum to its discriminant, then uses a numeric cast if needed. Casting is limited to Unit-only enums.

```rust
enum Enum { A, B, C }
assert_eq!(Enum::A as i32, 0);
assert_eq!(Enum::B as i32, 1);
assert_eq!(Enum::C as i32, 2);
```

**Casting is not allowed if the enum implements** **[`Drop`](https://doc.rust-lang.org/core/ops/drop/trait.Drop.html)**​ **. (因为强制转换后就不会再调用Drop)**
