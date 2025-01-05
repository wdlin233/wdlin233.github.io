---
author: wdlin
pubDatetime: 2024-10-20T17:51:06+08:00
modDatetime: 2024-12-17T10:57:00+08:00
title: Rustlings Learning Recording
slug: Rustling
featured: false
draft: false
tags:
  - Rust
description:
  My recording when learning Rustlings in OSCamp.
---

#### 2024/9/29

配置环境，WSL2下的Rust环境及WSL2与vscode的连接

#### 2024/10/1

复习一下先前学的所有权与引用相关的知识，还有Rust中字符串的处理。稍微看了下方法 Method的使用。

可变引用与不可变引用的核心就在于：**同一时刻，你只能拥有要么一个可变引用, 要么任意多个不可变引用**。

完成Rustlings的struct和enums习题(31-36)。

enums3需要match表达式的相关知识，学习了一点模式匹配。

又做了strings(37-40).

<!-- more -->

#### 2024/10/2

做练习的进度跟不上学习语法的进度，继续读Rust Course，有些地方还是不理解，尤其是Trait的部分。感觉看完能够看懂，但是不知道整体这么设计的目的。似乎Trait是Rust实现与C++继承类似的功能而做的复用性设计，而特征变量就是复用不同的Trait，再做了一层抽象。

读2.8泛型与特征、2.9集合类型、2.12包与模块。

写modules和hashmaps(41-46).

写hashmaps3(46)时有一个疑惑，`or_insert()`应返回一个`& mut v`的引用类型，**使用引用时应当先解引用**，但我可以直接写`v1.goals_scored += team_1_score`. 不知道是为什么？

再做options(47-49).

errors1(50).

#### 2024/10/3

继续Rustlings(errors2-6, 51-55, generics1-2, 56-57, traits 58-62). 

做errors2和errors3的时候，总算明白了之前出现多次的`.unwrap()`的含义，就是取正确返回的`Result` 或 `Option` 类型的返回值。另外还遇到了`.unwrap_err().to_string()`这个操作，`unwrap_err()`的意思是，将`Ok()`或者`Err()`中的值取出并报错。参考[RUST 中什么情况下要使用 .unwrap ( )_rust unwrap-CSDN博客](https://blog.csdn.net/weixin_40482577/article/details/137244187).

errors5使用`Box<dyn error::Error>`，还是不是很理解Box是怎么使用。在这里是`Result<_, E>`的返回值，为什么最后使用的是`error:Error`?

errors6似懂非懂，可以理解到需要`CreationError`和`ParseIntError`两种错误类型的检测。所以似乎是先用一层`map_err()?`，之后再用一层`map_err()`. 检测两次。

traits5此处运用了多重约束，本质上是一个泛型为基础的语法糖，在[Rust语言圣经](https://course.rs/basic/trait/trait.html#%E7%89%B9%E5%BE%81%E7%BA%A6%E6%9D%9Ftrait-bound)中有详细讨论。

#### 2024/10/4

继续做tests.(63-68)

tests5有点令人疑惑，传入值是`&mut t as *mut u32 as usize`，感觉令人无从下手。经过其自带注释的启发，先将传入的`mut address: usize`转为`*mut u32`的指针类型，再对指针所指向地址解引用修改即可。 

tests6考察的是用`into_raw()`创建野指针的处理方式，可见[五种兵器 - Rust语言圣经(Rust Course)](https://course.rs/advance/unsafe/superpowers.html?highlight=into_raw#基于智能指针创建裸指针)，及[Rust Box.into_raw用法及代码示例 - 纯净天空 (vimsky.com)](https://vimsky.com/examples/usage/rust-std-boxed-struct.Box.into_raw-rt.html). 答案需要用到`from_raw()`来取指针，并对`*ptr.b`进行修改。

**果然不会做就应该及时看hint**，此时的各种知识已经不是根据Rust圣经的排序了。

另外复习一下`to_owned()`这个函数，是获得其所有权的。参见[Rust 的 to_owned 和 clone 的区别 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/687511216#:-:text=to_owned). 在tests6中，运用于`assert!(ret.b == Some("hello".to_owned()));`

#### 2024/10/5

tests7和tests8都是用`println!`输出命令，tests7是环境变量，tests8是条件编译。这里试错了很久，主要是不了解cargo这里的命令该如何使用。比较笨的是忘了使用`\`对`"`进行转义。[Build Scripts - The Cargo Book (rust-lang.org)](https://doc.rust-lang.org/stable/cargo/reference/build-scripts.html#rustc-env)和[Build Scripts - The Cargo Book (rust-lang.org)](https://doc.rust-lang.org/stable/cargo/reference/build-scripts.html#rustc-cfg)

tests9是`#[no_mangle]`的应用，似乎是因为外部引用会导致函数名称的变化，这个属性就是让其保持原有的名称，不过我又重新定义了`my_demo_function_alias`这个函数，我怀疑我写错了，之后再看看。参考[extern - Rust (rustwiki.org)](https://rustwiki.org/zh-CN/std/keyword.extern.html)

lifetimes1, lifetimes2和lifetimes3都是圣经上的例子。

值得一提的是lifetimes3，是对结构体设置生命周期。或许可以说，我要让结构体和结构体内的成员处于同一作用域内，圣经[结构体 - Rust语言圣经(Rust Course)](https://course.rs/basic/compound-type/struct.html#结构体数据的所有权)中写：

> 在之前的 `User` 结构体的定义中，有一处细节：我们使用了自身拥有所有权的 `String` 类型而不是基于引用的 `&str` 字符串切片类型。这是一个有意而为之的选择：因为我们想要这个结构体拥有它所有的数据，而不是从其它地方借用数据

Rutslings69-74.

#### 2024/10/7

Rustlings(75-79, 80).

学习迭代器Iterator.

iterators2说是迭代器，不如说更多是字符串的操作. 看了hint后，说`first`是一个`char`. 看圣经说`next()`是一个消费者适配器，在这里似乎是将`c`的第一个字母去除了，但之后其他的字母都留存在`c`中，所以可以使用`as_str()`来转换.

> The variable `first` is a `char`. It needs to be capitalized and added to the remaining characters in `c` in order to return the correct `String`. The remaining characters in `c` can be viewed as a string slice using the`as_str` method.

iterators4不知道该怎么用迭代器来实现，这里用`(1..num+1).product()`非常巧妙.



iterators5这里的类型有点令人困惑，我查询`.values()`函数得到

>pub fn [values](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#method.values)(&self) -> [Values](https://doc.rust-lang.org/std/collections/hash_map/struct.Values.html)<'_, K, V> [ⓘ](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#)
>An iterator visiting all values in arbitrary order. The iterator element type is `&'a V`

所以在使用`filter()`指定类型时，应写`map.values().filter(|&x| *x == value).count()`

对于`flat_map()`:

```rust
let words = ["alpha", "beta", "gamma"];

// chars() returns an iterator
let merged: String = words.iter()
                          .flat_map(|s| s.chars())
                          .collect();
assert_eq!(merged, "alphabetagamma");
```

所以`collection.iter().flat_map(|x| x.values()).filter(|&x| *x == value).count()
`中的`x.values()`似乎就是返回一个迭代器对象，对迭代器中的每个元素再单独创建一个迭代器对象，该迭代器只有一个元素.

***

再学习多线程thread. `join()`方法可以让当前线程阻塞等待多线程的完成. `thread::spawn`取得的对象是`JoinHandle<u128>`，故需要用'`join()`取得. 我们得到的是`Result`类型，需要用`expect()`取得`Ok`值，若不成功取得则返回错误信息.

##### join()

> To learn when a thread completes, it is necessary to capture the [`JoinHandle`](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html) object that is returned by the call to [`spawn`](https://doc.rust-lang.org/std/thread/fn.spawn.html), which provides a `join` method that allows the caller to wait for the completion of the spawned thread:

```rust
use std::thread;

let thread_join_handle = thread::spawn(move || {
    // some work here
});
// some work here
let res = thread_join_handle.join();
```

> The [`join`](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html#method.join) method returns a [`thread::Result`](https://doc.rust-lang.org/std/thread/type.Result.html) containing [`Ok`](https://doc.rust-lang.org/std/result/enum.Result.html#variant.Ok) of the final value produced by the spawned thread, or [`Err`](https://doc.rust-lang.org/std/result/enum.Result.html#variant.Err) of the value given to a call to [`panic!`](https://doc.rust-lang.org/std/macro.panic.html) if the thread panicked.

##### expect()

> Returns the contained [`Ok`](https://doc.rust-lang.org/std/result/enum.Result.html#variant.Ok) value, consuming the `self` value.
>
> Because this function may panic, its use is generally discouraged. Instead, prefer to use pattern matching and handle the [`Err`](https://doc.rust-lang.org/std/result/enum.Result.html#variant.Err) case explicitly, or call [`unwrap_or`](https://doc.rust-lang.org/std/result/enum.Result.html#method.unwrap_or), [`unwrap_or_else`](https://doc.rust-lang.org/std/result/enum.Result.html#method.unwrap_or_else), or [`unwrap_or_default`](https://doc.rust-lang.org/std/result/enum.Result.html#method.unwrap_or_default).
>
> Panics if the value is an [`Err`](https://doc.rust-lang.org/std/result/enum.Result.html#variant.Err), with a panic message including the passed message, and the content of the [`Err`](https://doc.rust-lang.org/std/result/enum.Result.html#variant.Err).

[Result in std::result - Rust (rust-lang.org)](https://doc.rust-lang.org/std/result/enum.Result.html#method.expect)

另外，对于经常出现的`unwrap()`函数，也做下记录：对于`Option`取`Some`的值，对于`Result`取`Ok`的值.

#### 2024/10/8

多线程的锁结构需要智能指针的知识，再补.

Rustlings(81-82, 83-84).

**常规引用是一个指针类型**，包含了目标数据存储的内存地址。对常规引用使用 `*` 操作符，就可以通过解引用的方式获取到内存地址对应的数据值

```rust
fn main() {
    let x = 5;
    let y = &x;

    assert_eq!(5, x);
    assert_eq!(5, *y);
}
```

实现 `Deref` 后的智能指针结构体，就可以像普通引用一样，通过 `*` 进行解引用，例如 `Box<T>` 智能指针：

```rust
fn main() {
    let x = Box::new(1);
    let sum = *x + 1;
}
```

`String` 类型，它其实是一个**智能指针结构体**. 对于函数和方法的传参，Rust 提供了一个极其有用的隐式转换：`Deref `转换。若一个类型实现了 `Deref` 特征，那它的引用在传给函数或方法时，会根据参数签名来决定是否进行**隐式的 `Deref` 转换**，例如

```rust
fn main() {
    let s = String::from("hello world");
    display(&s)
}

fn display(s: &str) {
    println!("{}",s);
}
```

如果你以为 `Deref` 仅仅这点作用，那就大错特错了。`Deref` 可以支持连续的隐式转换，直到找到适合的形式为止：

```rust
fn main() {
    let s = MyBox::new(String::from("hello world"));
    display(&s)
}

fn display(s: &str) {
    println!("{}",s);
}
```

***

引用计数机制：

```rust
use std::rc::Rc;
fn main() {
    let a = Rc::new(String::from("hello, world"));
    let b = Rc::clone(&a);

    assert_eq!(2, Rc::strong_count(&a));
    assert_eq!(Rc::strong_count(&a), Rc::strong_count(&b))
}
```

以上代码我们使用 `Rc::new` 创建了一个新的 `Rc<String>` 智能指针并赋给变量 `a`，该指针指向底层的字符串数据。

智能指针 `Rc<T>` 在创建时，还会将引用计数加 1，此时获取引用计数的关联函数 `Rc::strong_count` 返回的值将是 `1`。

接着，我们又使用 `Rc::clone` 克隆了一份智能指针 `Rc<String>`，并将该智能指针的引用计数增加到 `2`。

由于 `a` 和 `b` 是同一个智能指针的两个副本，因此通过它们两个获取引用计数的结果都是 `2`。

不要被 `clone` 字样所迷惑，以为所有的 `clone` 都是深拷贝。这里的 `clone` **仅仅复制了智能指针并增加了引用计数，并没有克隆底层数据**，因此 `a` 和 `b` 是共享了底层的字符串 `s`，这种**复制效率是非常高**的。当然你也可以使用 `a.clone()` 的方式来克隆，但是从可读性角度，我们更加推荐 `Rc::clone` 的方式。

***

因为`Mutex<T>`是一个智能指针，准确的说是`m.lock()`返回一个智能指针`MutexGuard<T>`

- 它实现了`Deref`特征，会被自动解引用后获得一个引用类型，该引用指向`Mutex`内部的数据
- 它还实现了`Drop`特征，在超出作用域后，自动释放锁，以便其它线程能继续获取锁

```rust
use std::sync::Mutex;

fn main() {
    // 使用`Mutex`结构体的关联函数创建新的互斥锁实例
    let m = Mutex::new(5);

    {
        // 获取锁，然后deref为`m`的引用
        // lock返回的是Result
        let mut num = m.lock().unwrap();
        *num = 6;
        // 锁自动被drop
    }

    println!("m = {:?}", m);
}
```

在之前章节，我们提到过[内部可变性](https://course.rs/advance/smart-pointer/cell-refcell.html#内部可变性)，其中`Rc<T>`和`RefCell<T>`的结合，可以实现单线程的内部可变性。

现在我们又有了新的武器，由于`Mutex<T>`可以支持修改内部数据，当结合`Arc<T>`一起使用时，可以实现多线程的内部可变性。

简单总结下：`Rc<T>/RefCell<T>`用于单线程内部可变性， `Arc<T>/Mutex<T>`用于多线程内部可变性。

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();

            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Result: {}", *counter.lock().unwrap());
}
```

***

threads2是`Mutex`和`Arc`的综合运用，还结合了结构体，有点复杂. 关键在于`status_shared.lock().unwrap().jobs_completed += 1;`这个复合，最后输出也是类似，`println!("jobs completed {}", status.lock().unwrap().jobs_completed);`即可.

threads3和圣经中多发送者[线程同步：消息传递 - Rust语言圣经(Rust Course)](https://course.rs/advance/concurrency-with-threads/message-passing.html#使用多发送者)的例子很相似：由于子线程会拿走发送者的所有权，因此我们必须对发送者进行克隆，然后让每个线程拿走它的一份拷贝: `let tx1 = tx.clone();`.

Box1是圣经里的例子[Box堆对象分配 - Rust语言圣经(Rust Course)](https://course.rs/advance/smart-pointer/box.html#将动态大小类型变为-sized-固定大小类型)，避免动态大小类型而在定义时使用`Box<T>`.

#### 2024/10/9

Rustlings(85-86, 87-90, 91-93).

cow1使用`Cow`这个智能指针，处理的是所有权与可修改的问题。当其数据不拥有所有权时，不修改内容就返回不可变引用，修改内容便返回可变引用.

```rust
pub enum Cow<'a, B>
where
    B: 'a + ToOwned + ?Sized,
{
    Borrowed(&'a B),
    Owned(<B as ToOwned>::Owned),
}
```

```rust
use std::borrow::Cow;

fn abs_all(input: &mut Cow<'_, [i32]>) {
    for i in 0..input.len() {
        let v = input[i];
        if v < 0 {
            // Clones into a vector if not already owned.
            input.to_mut()[i] = -v;
        }
    }
}

// No clone occurs because `input` doesn't need to be mutated.
let slice = [0, 1, 2];
let mut input = Cow::from(&slice[..]);
abs_all(&mut input);

// Clone occurs because `input` needs to be mutated.
let slice = [-1, 0, 1];
let mut input = Cow::from(&slice[..]);
abs_all(&mut input);

// No clone occurs because `input` is already owned.
let mut input = Cow::from(vec![-1, 0, 1]);
abs_all(&mut input);
```

macros3在`mod`前加入`#[macro_use]`即可. 文件内结构如下:

- macros3
  - mod my_macro
  - main

这里用的宏都不是很复杂，题目也只涉及基本的概念，感觉只是会用宏但是自己不会写.

clippy1想自己定义`pi`但失败，因为默认`#[deny(clippy::approx_constant)]`是开启的，可以使用`f32::consts::PI`.

clippy2和clippy3感觉都是需要我们避免的低级错误.

#### 2024/10/10

读Weak与循环引用以及链表实现的部分内容.

conversations(94-98, 99-100)

对于`AsRef`:

> By creating a generic function that takes an `AsRef<str>` we express that we want to accept all references that can be converted to [`&str`](https://doc.rust-lang.org/std/primitive.str.html) as an argument. Since both [`String`](https://doc.rust-lang.org/std/string/struct.String.html) and [`&str`](https://doc.rust-lang.org/std/primitive.str.html) implement `AsRef<str>` we can accept both as input argument.

```rust
fn is_hello<T: AsRef<str>>(s: T) {
   assert_eq!("hello", s.as_ref());
}

let s = "hello";
is_hello(s);

let s = "hello".to_string();
is_hello(s);
```

`AsMut`类似:

> Using `AsMut` as trait bound for a generic function, we can accept all mutable references that can be converted to type `&mut T`.

```rust
// Rustlings: as_ref_mut.rs
fn num_sq<T: AsMut<u32>>(arg: &mut T) {
    *arg.as_mut() *= *arg.as_mut()
}
```

***

复习一下`collect()`的用法:

> Transforms an iterator into a collection.
>
> `collect()` can take anything iterable, and turn it into a relevant collection. This is one of the more powerful methods in the standard library, used in a variety of contexts.
>
> `collect()` can also create instances of types that are not typical collections. For example, a [`String`](https://doc.rust-lang.org/std/string/struct.String.html) can be built from [`char`](https://doc.rust-lang.org/std/primitive.char.html)s, and an iterator of [`Result`](https://doc.rust-lang.org/std/result/enum.Result.html) items can be collected into `Result<Collection<T>, E>`. See the examples below for more.

```rust
let a = [1, 2, 3];

let doubled: Vec<i32> = a.iter()
                         .map(|&x| x * 2)
                         .collect();

assert_eq!(vec![2, 4, 6], doubled);
```

```rust
let results = [Ok(1), Err("nope"), Ok(3), Err("bad")];

let result: Result<Vec<_>, &str> = results.iter().cloned().collect();

// gives us the first error
assert_eq!(Err("nope"), result);

let results = [Ok(1), Ok(3)];

let result: Result<Vec<_>, &str> = results.iter().cloned().collect();

// gives us the list of answers
assert_eq!(Ok(vec![1, 3]), result);
```

#### 2024/10/11

quiz2: [话说to_string(), into(), to_owned(), from()区别是什么](https://rustcc.cn/article?id=5111a32a-8134-4e4f-b9c1-17a1c354748c)讲解了字符串相关的几个函数.

> `to_owned()`creates owned data from borrowed data, usually by cloning.

```rust
let s: &str = "a";
let ss: String = s.to_owned();

let v: &[i32] = &[1, 2];
let vv: Vec<i32> = v.to_owned();
```

其余的，`into()`是基于`Into`特征，实现类型转换；`from()`基于`From`特征，将类型`T`转换为指导类型，与`into()`对称；`to_string`是`ToString`特征的一部分，当一个类型实现`Display`特征时就会自动实现`ToString`.



##### String and &str

对于如下代码段，

```rust
Command::Append(x) => string + &"bar".repeat(*x)
```

编译器会报错 

> `+` cannot be used to concatenate two `&str` strings.

这里的关系有点复杂，我问了GPT-4o. 回答说:

`"bar".repeat(*x)` 会创建一个新的 `String`，因此 `&"bar".repeat(*x)` 的类型是 `&String`, 而`string`变量得到的是`&String`类型.

**`+` 操作符需要左操作数是一个拥有所有权的 `String`，右操作数是一个 `&str`**. 因此，当你使用 `string + &"bar".repeat(*x)` 时，存在类型不匹配的问题：

- `string` 实际上是 `&String`（需要转换为 `String`）
- `&"bar".repeat(*x)` 是 `&String`（需要转换为 `&str`）

要解决这个问题，确保左操作数是一个 `String` 类型：

- 使用 `string.to_owned()` 或 `string.clone()` 将 `&String` 转为 `String`，以符合 `+` 操作符的要求：

```rust
Command::Append(x) => string.to_owned() + &"bar".repeat(*x)
```

这样操作后，`string.to_owned()` 会变成 `String` 类型，而 `&"bar".repeat(*x)` 会被**自动解引用**为 `&str`，适合 `+` 操作符的要求。

网上的一些解答也显示，在此处`to_owned()`, `to_string()`, `into()`都可以.

***

##### 格式化输出

参见 [格式化输出 - Rust语言圣经(Rust Course)](https://course.rs/basic/formatted-output.html).

与 `{}` 类似，`{:?}` 也是占位符：

- `{}` 适用于实现了 `std::fmt::Display` 特征的类型，用来以更优雅、更友好的方式格式化文本，例如展示给用户
- `{:?}` 适用于实现了 `std::fmt::Debug` 特征的类型，用于调试场景

其实两者的选择很简单，当你在写代码需要调试时，使用 `{:?}`，剩下的场景，选择 `{}`。

###### Debug特征

事实上，为了方便我们调试，大多数 Rust 类型都实现了 `Debug` 特征或者支持派生该特征：

```rust
#[derive(Debug)]
struct Person {
    name: String,
    age: u8
}

fn main() {
    let i = 3.1415926;
    let s = String::from("hello");
    let v = vec![1, 2, 3];
    let p = Person{name: "sunface".to_string(), age: 18};
    println!("{:?}, {:?}, {:?}, {:?}", i, s, v, p);
}
```

对于数值、字符串、数组，可以直接使用 `{:?}` 进行输出，但是对于结构体，需要[派生Debug](https://course.rs/appendix/derive.html)特征后，才能进行输出，总之很简单.

###### Display特征

与大部分类型实现了 `Debug` 不同，实现了 `Display` 特征的 Rust 类型并没有那么多，往往需要我们自定义想要的格式化方式：

```rust
let i = 3.1415926;
let s = String::from("hello");
let v = vec![1, 2, 3];
let p = Person {
    name: "sunface".to_string(),
    age: 18,
};
println!("{}, {}, {}, {}", i, s, v, p);
```

运行后可以看到 `v` 和 `p` 都无法通过编译，因为没有实现 `Display` 特征，但是你又不能像派生 `Debug` 一般派生 `Display`，只能另寻他法：

- 使用 `{:?}` 或 `{:#?}`
- 为自定义类型实现 `Display` 特征
- 使用 `newtype` 为外部类型实现 `Display` 特征

一个比较经典的例子就是为结构体实现`Display`特征.

quiz3中的`impl<T: std::fmt::Display> ReportCard<T>`就是结合了结构体的`Display`特征与结构体内泛型数据的实现.

***

algorithm1, 感觉还是有点难度，需要为泛型`T`实现`Ord`和`Clone`特征，然后在建立链表时和取变量时注意带上泛型的标注即可.

#### 2024/10/12

algorithm2可以首先转换首尾节点`std::mem::swap(&mut self.start, &mut self.end);`.

然后我们可以考虑将包括头尾的所有节点的前驱指针与后继指针转换，这样头指针将会从后往前指向尾指针.

关键在于Rust中的指针操作:

```rust
while let Some(current_ptr) = current {
    unsafe {
        let node = &mut *current_ptr.as_ptr();
        // 交换 next 和 prev 指针
        std::mem::swap(&mut node.next, &mut node.prev);
        // 移动到下一个节点
        current = node.prev;
    }
}
```

因为这里解引用了裸指针，所以需要使用`unsafe`. 再者，`as_ptr()`是因为，直接解引用 `NonNull` 或裸指针违背了 Rust 的安全保证，因为这对后端优化器和静态分析器来说指针的变动的信息。所以我们需要使用 `as_ptr()` 返回一个原始指针，并告诉编译器“我知道我在使用一个底层指针”（这与 Rust 强类型系统的设计哲学一致：使你更清晰地表达你的意图）. 

获取 `current_ptr` 所指向的节点的可变引用。`as_ptr()` 将 `NonNull` 转换为裸指针，而 `&mut *` 会解引用裸指针并获取节点.

algorithms3思路不难，主要是其中各种API. 例如`len()`和`swap()`. 参见[Vec in std::vec - Rust (rust-lang.org)](https://doc.rust-lang.org/std/vec/struct.Vec.html#method.swap)

algorithm4主要还是递归，有几个需要注意:

##### ref

**模式匹配时使用`ref`防止所有权转移**

```rust
 match self.root {
     Some(ref mut node) => node.insert(value),
     None => {
         self.root = Some(Box::new(TreeNode::new(value)));
     }
}
```

例如

```rust
match self.root {
    Some(node) => {
        // 这里使用了 node 的所有权
        assert!(node.left.is_none());
        assert!(node.right.is_none());
    },
    None => panic!("Root should not be None after insertion"),
}
```

- 如果 `self.root` 为 `Some(node)`，那么 `node` 的所有权将被移动到这个模式内。
- 结果是，`self.root` 将变成无效的，因为它的内容（即 `node`）已经被移动，而 Rust 不允许重复使用已经被移动的变量。

#### 2024/10/13

##### map_or()

对于搜索结果，我们可以使用`map_or()`来处理.

```rust
pub fn map_or<U, F>(self, default: U, f: F) -> U
where
    F: FnOnce(T) -> U,
```

> Returns the provided default result (if none), or applies a function to the contained value (if any).
>
> Arguments passed to `map_or` are eagerly evaluated; if you are passing the result of a function call, it is recommended to use [`map_or_else`](https://doc.rust-lang.org/std/option/enum.Option.html#method.map_or_else), which is lazily evaluated.

```rust
let x = Some("foo");
assert_eq!(x.map_or(42, |v| v.len()), 3);

let x: Option<&str> = None;
assert_eq!(x.map_or(42, |v| v.len()), 42);
```

为避免此处所有权的转移，我们可以使用`as_ref()`得到一个**引用**. 即`self.left.as_ref().map_or(false, |left| left.search(value))`.

另外，我们考虑使用`as_mut()` 方法，它能够从 `Option<T>` 生成一个 `Option<&mut T>`，提供对其内部值的可变引用。这使得我们可以修改内部的值（例如，树节点的值）而不移动所有权。

```rust
if let Some(left) = self.left.as_mut() {
    left.insert(value);
}
```

alogorithm5和algorithm6主要是要熟悉`VecDeque`和`HashSet`的API.

algorithm7自带的代码实现了迭代器的特性，可能我实现地有问题，我没有用到迭代器，就利用入栈、出栈与模式匹配就完成了这个练习.

#### 2024/10/14

algorithm8是用队列模拟栈. 这里有一个比较好的思路是，始终将q1当作栈. 具体而言，就是让每次入栈的元素都成为q1的队首元素. 这通过依次出队原先的q1元素并使其入队q2而得.

```rust
pub fn push(&mut self, elem: T) {
    //TODO
    self.q2.enqueue(elem);
    while let Ok(e) = self.q1.dequeue() {
        self.q2.enqueue(e);
    }
    std::mem::swap(&mut self.q1, &mut self.q2);
}
```

algorithm9可以说是很不会了. 这里借鉴了很多，有空再完善这部分的笔记.

algorithm10这里我就实现了`add_edge()`. 感觉对Rust的std很不熟悉，其中使用`entry()`获取对应的Hash值，这个返回的结果可以被`or_insert_with()`处理，若不存在对应键则会自动插入；`or_insert_with()`会返回对应键值(`-> V`)的可变引用.

```rust
self.adjacency_table.entry(String::from(node1))
    .or_insert_with(Vec::new)
    .push((String::from(node2), weight));
```

