<?php
/**
 * Theme status policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Theme\ThemeCompat;
\defined( 'ABSPATH' ) || exit;
/** Transport-neutral access and status payload. */
final class StatusRequest {
	/** Create the policy.
	 *
	 * @param ThemeCompat $compat Compatibility service.
	 */
	public function __construct( private ThemeCompat $compat ) {}
	/** Check status access.
	 *
	 * @param bool $authenticated Authentication state.
	 * @param bool $can_edit_posts Site-level capability.
	 */
	public function permission( bool $authenticated, bool $can_edit_posts ): ?DocumentResult {
		if ( ! $authenticated ) {
			return DocumentResult::error( 401, 'blixis_unauthenticated', 'Authentication is required.' );
		}
		return $can_edit_posts ? null : DocumentResult::error( 403, 'blixis_forbidden', 'Status access is forbidden.' );
	}
	/** Read-only state.
	 *
	 * @return array{theme: array{name: string, compatible: bool, declared: ?int, reason: string, supportedMin: int, supportedMax: int}, editing: array{enabled: bool, lockReason: ?string}, pluginVersion: string}
	 */
	public function status(): array {
		$theme = $this->compat->status();
		return [
			'theme'         => $theme->status_data(),
			'editing'       => [
				'enabled'    => $theme->compatible,
				'lockReason' => $theme->compatible ? null : $theme->reason,
			],
			'pluginVersion' => \Blixis\Builder\VERSION,
		];
	}
}
