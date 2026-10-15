<?php
/**
 * Mutable media authentication fixture.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

/** Logged-in state for MediaController permission tests. */
final class BlixisMediaAuthState {
	/** Whether the test user is logged in.
	 *
	 * @var bool
	 */
	public static bool $logged_in = false;
}
