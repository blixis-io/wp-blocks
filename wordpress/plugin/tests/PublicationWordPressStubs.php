<?php
/**
 * WordPress identity seam for isolated publication transport tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

require_once __DIR__ . '/BlixisMediaAuthState.php';
require_once __DIR__ . '/BlixisAuditHookState.php';
require_once __DIR__ . '/InvalidationState.php';

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- WordPress test stub.

/** Capture action invocation.
 *
 * @param string              $hook Hook name.
 * @param array<string,mixed> $event Audit payload.
 */
function do_action( string $hook, array $event ): void {
	BlixisAuditHookState::$events[] = [ $hook, $event ];
}

/** Media route authentication state. */
function is_user_logged_in(): bool {
	return BlixisMediaAuthState::$logged_in;
}

/** Fixed authenticated test user. */
function get_current_user_id(): int {
	return 7;
}

/** Stable cache epoch fixture. */
function wp_generate_uuid4(): string {
	return 'test-epoch';
}

/** Ignore option writes in isolated tests.
 *
 * @param string $option Option name.
 * @param mixed  $value Option value.
 * @param mixed  $autoload Autoload preference.
 */
function update_option( string $option, mixed $value, mixed $autoload = null ): bool {
	unset( $option, $value, $autoload );
	++BlixisInvalidationState::$updates;
	return true;
}
// phpcs:enable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound
