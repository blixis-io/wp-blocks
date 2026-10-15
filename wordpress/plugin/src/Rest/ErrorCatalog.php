<?php
/**
 * Stable public REST errors, without request data or internals.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

\defined( 'ABSPATH' ) || exit;

/** One documented status and fixed message for each plugin error code. */
final class ErrorCatalog {
	/** Public errors.
	 *
	 * @var array<string,array{int,string}>
	 */
	public const ERRORS = [
		'blixis_invalid_post_id'       => [ 400, 'Invalid post ID.' ],
		'blixis_invalid_locale'        => [ 400, 'Invalid locale.' ],
		'blixis_invalid_mode'          => [ 400, 'Invalid mode.' ],
		'blixis_invalid_revision'      => [ 400, 'Invalid revision.' ],
		'blixis_unauthenticated'       => [ 401, 'Authentication is required.' ],
		'blixis_forbidden'             => [ 403, 'Access is forbidden.' ],
		'blixis_revision_not_found'    => [ 404, 'Revision not found.' ],
		'blixis_snapshot_not_found'    => [ 404, 'Snapshot not found.' ],
		'blixis_media_not_found'       => [ 404, 'Media not found.' ],
		'blixis_conflict'              => [ 409, 'Revision conflict.' ],
		'blixis_snapshot_missing'      => [ 409, 'Snapshot is missing.' ],
		'blixis_layout_not_published'  => [ 409, 'Layout is not published.' ],
		'blixis_publish_blocked'       => [ 409, 'Publication is blocked.' ],
		'blixis_snapshot_limit'        => [ 409, 'Publish would exceed 200 stored snapshots, or rollback would exceed its recovery ceiling of 240.' ],
		'blixis_too_large'             => [ 413, 'Request is too large.' ],
		'blixis_theme_incompatible'    => [ 423, 'The active theme does not support Blixis editing.' ],
		'blixis_invalid_document'      => [ 422, 'Invalid document.' ],
		'blixis_locale_mismatch'       => [ 422, 'The content belongs to another locale.' ],
		'blixis_nothing_to_publish'    => [ 422, 'Nothing to publish.' ],
		'blixis_precondition_required' => [ 428, 'If-Match is required.' ],
		'blixis_rate_limited'          => [ 429, 'Publication rate limit reached.' ],
		'blixis_storage_error'         => [ 500, 'Storage failed.' ],
		'blixis_preview_failed'        => [ 500, 'Preview failed.' ],
	];

	/**
	 * Fixed message for a code.
	 *
	 * @param string $code Error code.
	 */
	public static function message( string $code ): string {
		return self::ERRORS[ $code ][1] ?? 'Invalid request.';
	}
}
