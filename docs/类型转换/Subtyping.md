# Subtyping

> 当不考虑引用周期时，一个类型T的唯一“子类型”就是它自身，可以视为不存在子类型 **(不存在非平凡的子类型关系)。**

Subtyping is implicit and can occur at any stage in type checking or inference.

Subtyping is restricted to two cases: variance with respect to lifetimes and between types with higher ranked lifetimes. If we were to erase lifetimes from types, then the only subtyping would be due to type equality.

Consider the following example: string literals always have `'static`​lifetime. Nevertheless, we can assign `s`​ to `t`:

```rust
fn bar<'a>() {
    let s: &'static str = "hi";
    let t: &'a str = s;
}
```

Since `'static`​ outlives the lifetime parameter `'a`​, `&'static str`​ is a subtype of `&'a str`.

[Higher-ranked](https://doc.rust-lang.org/nomicon/hrtb.html) [function pointers](https://doc.rust-lang.org/reference/types/function-pointer.html) and [trait objects](https://doc.rust-lang.org/reference/types/trait-object.html) have another subtype relation. They are subtypes of types that are given by substitutions of the higher-ranked lifetimes. Some examples:

```rust
// Here 'a is substituted for 'static
let subtype: &(for<'a> fn(&'a i32) -> &'a i32) = &((|x| x) as fn(&_) -> &_);
let supertype: &(fn(&'static i32) -> &'static i32) = subtype;

// This works similarly for trait objects
let subtype: &(dyn for<'a> Fn(&'a i32) -> &'a i32) = &|x| x;
let supertype: &(dyn Fn(&'static i32) -> &'static i32) = subtype;

// We can also substitute one higher-ranked lifetime for another
let subtype: &(for<'a, 'b> fn(&'a i32, &'b i32))= &((|x, y| {}) as fn(&_, &_));
let supertype: &for<'c> fn(&'c i32, &'c i32) = subtype;
```
