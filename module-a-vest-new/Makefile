include $(APPDIR)/Make.defs

PROGNAME = aura_vest
PRIORITY = SCHED_PRIORITY_DEFAULT
STACKSIZE = 4096
MODULE = $(CONFIG_EXAMPLES_AURA_VEST)

MAINSRC = aura_vest_main.c

ifeq ($(CONFIG_NIMBLE),y)
CSRCS += aura_ble_nimble.c
include $(APPDIR)/wireless/bluetooth/nimble/Makefile.nimble
endif

include $(APPDIR)/Application.mk
