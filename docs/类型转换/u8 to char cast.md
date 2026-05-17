# u8 to char cast

Casts to the `char` with the corresponding code point.

```rust
assert_eq!(65u8 as char, 'A');
assert_eq!(214u8 as char, 'Ö');
```

因为超过 0xFF 的整数不能保证被转换到有效 Unicode 所以 Rust 默认启用 `#[deny(overflowing_literals)]`​ ，只允许 `u8`​ 到 `char` 的强制类型转换。

‍
