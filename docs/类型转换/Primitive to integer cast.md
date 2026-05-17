# Primitive to integer cast

- ​`false`​ casts to `0`​, `true`​ casts to `1`
- ​`char`​ casts to the value of the code point, then uses a numeric cast if needed.  
  Rust 的 `char`​ 类型为一个 Unicode 标量值(Unicode Scalar Value)，其底层是一个 21 位的整数，存储为 `u32`​。当对 `char`​ 进行类型转换时，它首先被转换为其对应的 Unicode 代码点的值(`u32`​)，如果目标类型不是 `u32`，Rust 会在此基础上进行额外的数值类型转换。

```rust
assert_eq!(false as i32, 0);
assert_eq!(true as i32, 1);
assert_eq!('A' as i32, 65);
assert_eq!('Ö' as i32, 214);
```

‍
