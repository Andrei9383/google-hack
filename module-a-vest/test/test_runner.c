#include <stdio.h>

void test_distance_conversion(void);
void test_dc_motor_output(void);
void test_haptic_mapping(void);
void test_ble_payload_encoding(void);
void test_haptic_patterns(void);
void test_override_state(void);

int main(void) {
    test_distance_conversion();
    test_dc_motor_output();
    test_haptic_mapping();
    test_ble_payload_encoding();
    test_haptic_patterns();
    test_override_state();

    puts("All aura vest tests passed.");
    return 0;
}