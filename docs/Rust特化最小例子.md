# Specialization

两张"地图"驱动的是同一台机器：**子 impl 的头是父 impl 头的代入实例**。第一关代入一次，第二关代入出一整条包含链。

## 例一

```rust
#![feature(specialization)]

trait Sp<B> {
    fn which() -> &'static str;
}

impl<A, B> Sp<B> for A {                    // parent：对任意 A、B
    default fn which() -> &'static str { "parent" }
}
impl<A> Sp<u8> for A {                      // child：只钉住 B
    fn which() -> &'static str { "child" }
}

struct Thing;                               // 连 PartialEq 都没有

fn main() {
    println!("{}", <Thing as Sp<u8>>::which());   // child
    println!("{}", <Thing as Sp<i16>>::which());  // parent
}
```

（上面两行注释是实跑输出。）

这段代码的要点是：Rust 里一个 impl 的头部有 Self（`for A`）和 trait 实参（`Sp<B>` 的 `B`）两个独立槽位，而"更具体的 impl 覆盖一般的 impl"（specialization）判定的是**整个头部能否由父 impl 的头部代入得到** —— 所以 child 只把 `B` 钉成 `u8`、`A` 完全不动就已经构成特化：`Thing` 这种连 `PartialEq` 都没有的类型，在 `Sp<u8>` 下命中的也是 child，而 `Sp<i16>` 没有更具体的实现可用就回退到 parent 的 `default` 实现；前提是开 `#![feature(specialization)]`（nightly 的不完整功能，标准库自己用的是更保守的 `min_specialization`），否则两份重叠的 impl 过不了连贯性检查，直接 E0119；parent 的方法必须标 `default` 表示"允许被覆盖"（不标报 E0520），child 的 where 子句则只能继承、不能凭空加强（`min_specialization` 下新增约束必须来自被 `#[rustc_specialization_trait]` 标记的 trait —— 标准库 `SlicePartialEq<B> for A` 那对 `where A: PartialEq<B>` / `where A: BytewiseEq<B>` 就是靠这个让 `[T] == [U]` 在编译期选到 memcmp 快路径）；最后，选择完全发生在编译期（单态化），运行时没有任何分支。

## 例二

```rust
#![feature(specialization)]

trait Kind {
    fn kind() -> &'static str;
}

impl<T> Kind for T {                      // 根：覆盖所有 T
    default fn kind() -> &'static str { "any T" }
}
impl<T> Kind for Vec<T> {                 // 范围更小：只覆盖 Vec<T>
    default fn kind() -> &'static str { "Vec<T>" }
}
impl Kind for Vec<u8> {                   // 范围更小：只覆盖 Vec<u8>
    fn kind() -> &'static str { "Vec<u8>" }
}

fn main() {
    println!("u8            -> {}", <u8 as Kind>::kind());
    println!("String        -> {}", <String as Kind>::kind());
    println!("Vec<u16>      -> {}", <Vec<u16> as Kind>::kind());
    println!("Vec<Vec<u8>>  -> {}", <Vec<Vec<u8>> as Kind>::kind());
    println!("Vec<i32>      -> {}", <Vec<i32> as Kind>::kind());
    println!("Vec<u8>       -> {}", <Vec<u8> as Kind>::kind());
}
```

实跑输出：

```text
u8            -> any T
String        -> any T
Vec<u16>      -> Vec<T>
Vec<Vec<u8>>  -> Vec<T>
Vec<i32>      -> Vec<T>
Vec<u8>       -> Vec<u8>
```

比第一关"进阶"的地方在于：子 impl 的头不再是父 impl 头的一次代入就到此为止，而是一串**真包含**——`Vec<u8> ⊂ Vec<T> ⊂ T`，而且这次收窄的是 Self 槽（第一关收窄的是 trait 实参槽）。编译器永远选**最小的那个适用 impl**：`u8`、`String` 落在根上，`Vec<u16>`、`Vec<Vec<u8>>`、`Vec<i32>` 落在中间层（注意 `Vec<Vec<u8>>` 也属于 `Vec<T>`，所以它不会掉到第三层），只有 `Vec<u8>` 精确命中第三层；三层链里每一层的 item 都要标 `default`，才能被下一层继续覆盖。
