---
author: wdlin
pubDatetime: 2025-03-01T20:54:00+08:00
modDatetime: 2025-03-01T20:54:00+08:00
title: About Function StackFrame
slug: StackFrame
featured: false
draft: false
tags:
  - rCore
  - OS
description:
  My understanding about function stackframe.
---

## 关于函数栈帧StackFrame

在rcore文档中对函数栈帧的[解读](https://rcore-os.cn/rCore-Tutorial-Book-v3/chapter1/5support-func-call.html?highlight=%E6%A0%88%E5%B8%A7)中有两处不好理解，`ra`和`fp`. 

首先可以先考虑一个进程的内存，应该有内核栈、用户栈、代码库、用户堆、数据和代码等等组成（参考《现代操作系统：原理与实现》）。如果问AI这个问题或者是网络上的blog，会说由代码段、数据段、BSS段、堆和栈组成。

| 内存区域         | 存储内容                  | 权限    | 动态性    |     |
| ------------ | --------------------- | ----- | ------ | --- |
| **代码段**      | 可执行指令（`.text` 段）      | 只读+执行 | 静态     |     |
| **数据段**      | 已初始化的全局/静态变量（`.data`） | 可读+写  | 静态     |     |
| **BSS 段**    | 未初始化的全局/静态变量（`.bss`）  | 可读+写  | 静态（清零） |     |
| **堆（Heap）**  | 动态分配的内存（`malloc` 等）   | 可读+写  | 动态增长   |     |
| **栈（Stack）** | 函数调用栈帧、局部变量           | 可读+写  | 动态增长   |     |

函数的栈帧保存在**栈**区域中，执行的代码保存在代码段中。

关于一个栈帧包含什么，可以见[函数调用过程中的栈帧与内存管理](https://blog.csdn.net/weixin_41519463/article/details/122203481)一篇。一个栈从高地址向低地址延申，`fp`表示栈底所在的位置（高地址，Frame Pointer），`sp`表示栈顶（低地址，Stack Pointer）。在32位的x86架构上这两个值分别用`ebp`和`esp`表示，64位上是`rbp`和`rsp`.

不妨使用一个[简单的代码](https://godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYTStJg1DIApACYAQuYukl9ZATwDKjdAGFUtAK4sGIM6SuADJ4DJgAcj4ARpjEEgCspAAOqAqETgwe3r7%2ByanpAiFhkSwxcVyJdpgOGUIETMQEWT5%2BAVU1AnUNBEUR0bEJtvWNzTltwz2hfaUDFQCUtqhexMjsHOYAzKHI3lgA1CYbbgoE%2BKgAdAiH2CYaAIK3d6EEewo%2BEM97AFRMpHufXyicwOAHYrPc9pD/oI9qYNuC7lDYQcNgARb5MA6Wb5RQ4IpHETAEZYMWF4x4mEGoin3T4sJihCDAyn4qGfX57XHwx5IzGHdFcABsfyiKPRGzM5IhULeLAg5kFHIVQKliKhSWIzyo8rMkrM8XQJnibgY5gCewgTAAtEC5qqCUSSXsNKrKaiOAtaJx4rw/BwtKRUJw3NZrK8litMFiNjxSARNB6FgBrEAbDbnNOZrPZ4VejiSXgsCQaDSkP0BoMcXgKECl%2BP%2Bj2kOCwJBoFhJOixciUNsd%2BhxWioATABrIBCCyTALi60s0WgEWI1iBRBOkKKhBoAT04sfXzGIm4A8lFtNV67G22xBIeGLRtw3SFgol5gG4xLQa9xeFh6UZxA/8EJGoADdME/ANMFUaovAXHdeGeTA8wDWg8CiYgtw8LBVwITUiy/UhQOIKJUkwVFMF/YAUKMBMFioAxgAUAA1PBMAAd0PJJGDgmRBBEMR2CkHj5CUNRV10Lh9EMYxQ0sfRUJrSAFlQJJHAET8rUPDZeFQQjNSwBSmVsRCzwyFwGHcTwWn8UtgimEoygkEE8jSVTMkssZSxSFyMl6ezZic9pXK6EZ3NaUtAtqCZfP6coAomUYwqGbpopmWKFgUCNVgkT1vV9VdKz2Qdh1HcdJD2YBkGQPZp3OMxzg0C1cEIEhoy4OZeHrLQ5gWBBMCYLA4kMlM0wzbMxrTXNOALMt8s4atazjGimxgRAUFQdtOzICgIF7TaQGIYCJytCrkGnMxZzoBdiCXFcHz3LduPug9j1PBxuMvRgCBvO9VyfF831oD9uJ/KT/wDQCTNA8DeEg6DYPwhCkN4FC0IwjA1gDHC8Dw2NCOIpQyIoqjQAbWj6KYlj2M4v1Y34XjRHEQS6eElR1AfXQAgMajTEsaw5KiAylJUjJ1M07TdLwfT4HS4yOj8CBXASvRbOKGK9C8go3OyPwJI11yUociSIs6eLQr0Y2GGCyZVdS83Te1u3krstW2sWZYstdvMfRmh8CoAJQASSENwrUYi0jvXAgFGBE7qrquqGogJqiGIVr2sW0nk1TdNxvG/Qpry325tsBbOsTfOODMQuK2LsvuoIxdTMkIA%3D)来探究。根据函数调用的内存对齐规则，故有`sub rsp, 8`一句。

| 操作            | 对 `rsp` 的影响        | 对齐状态            |
| ------------- | ------------------ | --------------- |
| `call main`   | `rsp -= 8`（压入返回地址） | 未对齐（`rsp%16=8`） |
| `sub rsp, 8`  | `rsp -= 8`（主动调整）   | 对齐（`rsp%16=0`）  |
| `call printf` | `rsp -= 8`（压入返回地址） | 未对齐（`rsp%16=8`） |
| `add rsp, 8`  | `rsp += 8`（恢复调整）   | 对齐（`rsp%16=0`）  |

`li a1, -16` 的作用是 将立即数 `-16` 加载到寄存器 `a1` 中，其他的指令可以参考[运算与控制流指令](https://blog.csdn.net/zsqianqiu/article/details/126072004)和[When to use j, jal, Jr, jalr?](https://www.reddit.com/r/RISCV/comments/13rcn8e/comment/jljjjqz/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button).

注意RISC-V是[小端序](https://zh.wikipedia.org/wiki/%E5%AD%97%E8%8A%82%E5%BA%8F#%E5%B0%8F%E7%AB%AF%E5%BA%8F)， 高位是`%hi()`，低位`%lo()`.

> 这里吐槽一下LoongArch的汇编看着好丑，各种 `.` 和 `$` 不如 RV.

说回`ra`和`fp`的作用。`ra`字面意思是返回地址，指的是当前函数执行完毕后应返回的地址，在函数返回前要从栈中加载`ra`，然后通过`ret/jr`跳转回调用者。也就是说`ra`是之前被调用处的一个中断的地址位置。`fp`(`preview fp`) 是父函数栈帧的帧指针，也就是要恢复的父函数栈帧基址。

`ra`主要指的是函数调用，`fp`是栈帧。

假设函数 `A` 调用函数 `B`：

1. **进入 `B` 时**：
    
    - `B` 的栈帧保存 `A` 的 `ra`（返回地址）和 `A` 的 `fp`（父帧指针）。
        
    - `B` 的 `fp` 被设置为当前栈帧的基址（如 `sp + offset`）。
        
2. **退出 `B` 时**：
    
    - 从栈中恢复 `A` 的 `ra` 到 `ra` 寄存器，恢复 `A` 的 `fp` 到 `fp` 寄存器。
        
    - 调整 `sp` 释放 `B` 的栈空间，通过 `ret` 跳转回 `A` 继续执行。
