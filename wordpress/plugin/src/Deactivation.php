<?php
/**
 * Builder deactivation policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

\defined( 'ABSPATH' ) || exit;

/**
 * Deactivation preserves all options and content for reactivation or export.
 */
final class Deactivation {

	/** Deliberately leave persistent state untouched. */
	public static function deactivate(): void {}
}
