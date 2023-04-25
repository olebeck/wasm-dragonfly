package main

import (
	"syscall"
	"syscall/js"
)

var (
	errEAGAIN error = syscall.EAGAIN
	errEINVAL error = syscall.EINVAL
	errENOENT error = syscall.ENOENT
)

func errnoErr(e syscall.Errno) error {
	switch e {
	case 0:
		return nil
	case syscall.EAGAIN:
		return errEAGAIN
	case syscall.EINVAL:
		return errEINVAL
	case syscall.ENOENT:
		return errENOENT
	}
	return e
}

var errnoByCode = map[string]syscall.Errno{
	"EPERM":           syscall.EPERM,
	"ENOENT":          syscall.ENOENT,
	"ESRCH":           syscall.ESRCH,
	"EINTR":           syscall.EINTR,
	"EIO":             syscall.EIO,
	"ENXIO":           syscall.ENXIO,
	"E2BIG":           syscall.E2BIG,
	"ENOEXEC":         syscall.ENOEXEC,
	"EBADF":           syscall.EBADF,
	"ECHILD":          syscall.ECHILD,
	"EAGAIN":          syscall.EAGAIN,
	"ENOMEM":          syscall.ENOMEM,
	"EACCES":          syscall.EACCES,
	"EFAULT":          syscall.EFAULT,
	"EBUSY":           syscall.EBUSY,
	"EEXIST":          syscall.EEXIST,
	"EXDEV":           syscall.EXDEV,
	"ENODEV":          syscall.ENODEV,
	"ENOTDIR":         syscall.ENOTDIR,
	"EISDIR":          syscall.EISDIR,
	"EINVAL":          syscall.EINVAL,
	"ENFILE":          syscall.ENFILE,
	"EMFILE":          syscall.EMFILE,
	"ENOTTY":          syscall.ENOTTY,
	"EFBIG":           syscall.EFBIG,
	"ENOSPC":          syscall.ENOSPC,
	"ESPIPE":          syscall.ESPIPE,
	"EROFS":           syscall.EROFS,
	"EMLINK":          syscall.EMLINK,
	"EPIPE":           syscall.EPIPE,
	"ENAMETOOLONG":    syscall.ENAMETOOLONG,
	"ENOSYS":          syscall.ENOSYS,
	"EDQUOT":          syscall.EDQUOT,
	"EDOM":            syscall.EDOM,
	"ERANGE":          syscall.ERANGE,
	"EDEADLK":         syscall.EDEADLK,
	"ENOLCK":          syscall.ENOLCK,
	"ENOTEMPTY":       syscall.ENOTEMPTY,
	"ELOOP":           syscall.ELOOP,
	"ENOMSG":          syscall.ENOMSG,
	"EIDRM":           syscall.EIDRM,
	"ECHRNG":          syscall.ECHRNG,
	"EL2NSYNC":        syscall.EL2NSYNC,
	"EL3HLT":          syscall.EL3HLT,
	"EL3RST":          syscall.EL3RST,
	"ELNRNG":          syscall.ELNRNG,
	"EUNATCH":         syscall.EUNATCH,
	"ENOCSI":          syscall.ENOCSI,
	"EL2HLT":          syscall.EL2HLT,
	"EBADE":           syscall.EBADE,
	"EBADR":           syscall.EBADR,
	"EXFULL":          syscall.EXFULL,
	"ENOANO":          syscall.ENOANO,
	"EBADRQC":         syscall.EBADRQC,
	"EBADSLT":         syscall.EBADSLT,
	"EDEADLOCK":       syscall.EDEADLOCK,
	"EBFONT":          syscall.EBFONT,
	"ENOSTR":          syscall.ENOSTR,
	"ENODATA":         syscall.ENODATA,
	"ETIME":           syscall.ETIME,
	"ENOSR":           syscall.ENOSR,
	"ENONET":          syscall.ENONET,
	"ENOPKG":          syscall.ENOPKG,
	"EREMOTE":         syscall.EREMOTE,
	"ENOLINK":         syscall.ENOLINK,
	"EADV":            syscall.EADV,
	"ESRMNT":          syscall.ESRMNT,
	"ECOMM":           syscall.ECOMM,
	"EPROTO":          syscall.EPROTO,
	"EMULTIHOP":       syscall.EMULTIHOP,
	"EDOTDOT":         syscall.EDOTDOT,
	"EBADMSG":         syscall.EBADMSG,
	"EOVERFLOW":       syscall.EOVERFLOW,
	"ENOTUNIQ":        syscall.ENOTUNIQ,
	"EBADFD":          syscall.EBADFD,
	"EREMCHG":         syscall.EREMCHG,
	"ELIBACC":         syscall.ELIBACC,
	"ELIBBAD":         syscall.ELIBBAD,
	"ELIBSCN":         syscall.ELIBSCN,
	"ELIBMAX":         syscall.ELIBMAX,
	"ELIBEXEC":        syscall.ELIBEXEC,
	"EILSEQ":          syscall.EILSEQ,
	"EUSERS":          syscall.EUSERS,
	"ENOTSOCK":        syscall.ENOTSOCK,
	"EDESTADDRREQ":    syscall.EDESTADDRREQ,
	"EMSGSIZE":        syscall.EMSGSIZE,
	"EPROTOTYPE":      syscall.EPROTOTYPE,
	"ENOPROTOOPT":     syscall.ENOPROTOOPT,
	"EPROTONOSUPPORT": syscall.EPROTONOSUPPORT,
	"ESOCKTNOSUPPORT": syscall.ESOCKTNOSUPPORT,
	"EOPNOTSUPP":      syscall.EOPNOTSUPP,
	"EPFNOSUPPORT":    syscall.EPFNOSUPPORT,
	"EAFNOSUPPORT":    syscall.EAFNOSUPPORT,
	"EADDRINUSE":      syscall.EADDRINUSE,
	"EADDRNOTAVAIL":   syscall.EADDRNOTAVAIL,
	"ENETDOWN":        syscall.ENETDOWN,
	"ENETUNREACH":     syscall.ENETUNREACH,
	"ENETRESET":       syscall.ENETRESET,
	"ECONNABORTED":    syscall.ECONNABORTED,
	"ECONNRESET":      syscall.ECONNRESET,
	"ENOBUFS":         syscall.ENOBUFS,
	"EISCONN":         syscall.EISCONN,
	"ENOTCONN":        syscall.ENOTCONN,
	"ESHUTDOWN":       syscall.ESHUTDOWN,
	"ETOOMANYREFS":    syscall.ETOOMANYREFS,
	"ETIMEDOUT":       syscall.ETIMEDOUT,
	"ECONNREFUSED":    syscall.ECONNREFUSED,
	"EHOSTDOWN":       syscall.EHOSTDOWN,
	"EHOSTUNREACH":    syscall.EHOSTUNREACH,
	"EALREADY":        syscall.EALREADY,
	"EINPROGRESS":     syscall.EINPROGRESS,
	"ESTALE":          syscall.ESTALE,
	"ENOTSUP":         syscall.ENOTSUP,
	"ENOMEDIUM":       syscall.ENOMEDIUM,
	"ECANCELED":       syscall.ECANCELED,
	"ELBIN":           syscall.ELBIN,
	"EFTYPE":          syscall.EFTYPE,
	"ENMFILE":         syscall.ENMFILE,
	"EPROCLIM":        syscall.EPROCLIM,
	"ENOSHARE":        syscall.ENOSHARE,
	"ECASECLASH":      syscall.ECASECLASH,
	"EWOULDBLOCK":     syscall.EWOULDBLOCK,
}

func mapJSError(jsErr js.Value) error {
	errno, ok := errnoByCode[jsErr.Get("code").String()]
	if !ok {
		panic(jsErr)
	}
	return errnoErr(syscall.Errno(errno))
}
func netCall(name string, args ...any) (js.Value, error) {
	type callResult struct {
		val js.Value
		err error
	}

	c := make(chan callResult, 1)
	f := js.FuncOf(func(this js.Value, args []js.Value) any {
		var res callResult

		if len(args) >= 1 { // on Node.js 8, fs.utimes calls the callback without any arguments
			if jsErr := args[0]; !jsErr.IsNull() {
				res.err = mapJSError(jsErr)
			}
		}

		res.val = js.Undefined()
		if len(args) >= 2 {
			res.val = args[1]
		}

		c <- res
		return nil
	})
	defer f.Release()
	jsListener.Call(name, append(args, f)...)
	res := <-c
	return res.val, res.err
}
