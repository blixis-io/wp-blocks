<?php
/**
 * Minimal WordPress activation fixtures for BWB-039.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

/** Tiny per-site option store for the WordPress calls used by Activation. */
final class FakeOptions {
	/** Options by site ID.
	 *
	 * @var array<int, array<string, mixed>>
	 */
	public static array $sites = [];
	/** Calls to add_option.
	 *
	 * @var list<array{int, string, mixed, string, bool}>
	 */
	public static array $calls = [];
	/** Previous site contexts.
	 *
	 * @var list<int>
	 */
	public static array $stack = [];
	/** Current site ID.
	 *
	 * @var int
	 */
	public static int $current = 1;
	/** Whether the fixture has multiple sites.
	 *
	 * @var bool
	 */
	public static bool $multisite = false;
}
