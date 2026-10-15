<?php
/**
 * Editor access result.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

\defined( 'ABSPATH' ) || exit;

/** Stable result categories for the isolated editor request. */
final class EditorAccessResult {
	public const ALLOWED         = 'allowed';
	public const UNAUTHENTICATED = 'unauthenticated';
	public const FORBIDDEN       = 'forbidden';
	public const THEME_LOCKED    = 'theme_locked';

	/**
	 * Create a result.
	 *
	 * @param string  $state Access category.
	 * @param ?string $lock_reason Theme reason for read-only access.
	 */
	public function __construct( public readonly string $state, public readonly ?string $lock_reason = null ) {}
}
