<?php
/**
 * Request policy of the publication routes.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Publication\PublishOptions;
use Blixis\Builder\Publication\PublishResult;
use Blixis\Builder\Publication\Publisher;
use Blixis\Builder\Publication\RateLimiter;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;

\defined( 'ABSPATH' ) || exit;

/** Authorization, strict body validation and mapping to the publisher; no WordPress calls. */
final class PublicationRequest {
	private const MAX_BODY = 512;

	/**
	 * Create the policy.
	 *
	 * @param Publisher    $publisher Publisher.
	 * @param PostAccess   $access Post access policy.
	 * @param SiteLocale   $site Site locale.
	 * @param ?ThemeGuard  $guard Shared theme policy.
	 * @param ?RateLimiter $limiter Rolling publish limit.
	 */
	public function __construct( private readonly Publisher $publisher, private readonly PostAccess $access, private readonly SiteLocale $site, private ?ThemeGuard $guard = null, private ?RateLimiter $limiter = null ) {}

	/**
	 * Check access: reading the state needs edit rights, changing it needs the publish capability.
	 *
	 * @param int  $post_id Post ID.
	 * @param bool $changes_state Whether the route publishes or rolls back.
	 * @return ?PublishResult Null when allowed.
	 */
	public function permission( int $post_id, bool $changes_state ): ?PublishResult {
		$denied = ( $this->guard ?? new ThemeGuard( $this->access, new ThemeCompat( new WordPressCompatibilityReader() ) ) )->permission( $post_id, $changes_state, $changes_state );
		return null === $denied ? null : PublishResult::error( $denied->status, $denied->error_code ?? 'blixis_forbidden', $denied->body );
	}

	/**
	 * The publication state.
	 *
	 * @param int $post_id Post ID.
	 * @return PublishResult
	 */
	public function status( int $post_id ): PublishResult {
		try {
			return PublishResult::ok( $this->publisher->status( $post_id ) );
		} catch ( \RuntimeException $error ) {
			return PublishResult::error( 500, 'blixis_storage_error' );
		}
	}

	/**
	 * Publish the working layout and/or the working content of one locale.
	 *
	 * @param int     $post_id Post ID.
	 * @param ?string $if_match Pointer revision header (`"n"`).
	 * @param string  $body JSON body.
	 * @param int     $actor WordPress user ID.
	 * @return PublishResult
	 */
	public function publish( int $post_id, ?string $if_match, string $body, int $actor = 0 ): PublishResult {
		$expected = $this->expected( $if_match );
		if ( $expected instanceof PublishResult ) {
			return $expected;
		}
		$data = $this->body( $body, [ 'layout', 'locale', 'confirmImpact', 'excludeIncompatible' ] );
		if ( null === $data ) {
			return PublishResult::error( 422, 'blixis_invalid_document' );
		}
		$layout = $data['layout'] ?? false;
		$locale = $data['locale'] ?? null;
		$flags  = [ $data['confirmImpact'] ?? false, $data['excludeIncompatible'] ?? false ];
		if ( ! \is_bool( $layout ) || ( null !== $locale && ( ! \is_string( $locale ) || ! MetaKeys::is_valid_locale( $locale ) ) ) || ! \is_bool( $flags[0] ) || ! \is_bool( $flags[1] ) ) {
			return PublishResult::error( 422, 'blixis_invalid_document' );
		}
		return $this->apply( $post_id, $actor, new PublishOptions( $expected, $layout, $locale, $flags[0], $flags[1], null, null, $this->site->default_locale() ) );
	}

	/**
	 * Roll back: republish an old layout snapshot, or an old content snapshot (with its layout) of a locale.
	 *
	 * @param int     $post_id Post ID.
	 * @param ?string $if_match Pointer revision header (`"n"`).
	 * @param string  $body JSON body.
	 * @param int     $actor WordPress user ID.
	 * @return PublishResult
	 */
	public function rollback( int $post_id, ?string $if_match, string $body, int $actor = 0 ): PublishResult {
		$expected = $this->expected( $if_match );
		if ( $expected instanceof PublishResult ) {
			return $expected;
		}
		$data = $this->body( $body, [ 'layoutSnapshot', 'locale', 'contentSnapshot', 'confirmImpact' ] );
		if ( null === $data ) {
			return PublishResult::error( 422, 'blixis_invalid_document' );
		}
		$layout_snapshot  = $data['layoutSnapshot'] ?? null;
		$content_snapshot = $data['contentSnapshot'] ?? null;
		$locale           = $data['locale'] ?? null;
		$confirm          = $data['confirmImpact'] ?? false;
		$layout_ok        = null === $layout_snapshot || ( \is_int( $layout_snapshot ) && $layout_snapshot > 0 );
		$content_ok       = null === $content_snapshot || ( \is_int( $content_snapshot ) && $content_snapshot > 0 );
		$locale_ok        = null === $locale || ( \is_string( $locale ) && MetaKeys::is_valid_locale( $locale ) );
		if ( ! $layout_ok || ! $content_ok || ! $locale_ok || ! \is_bool( $confirm ) || ( null === $layout_snapshot ) === ( null === $content_snapshot ) || ( null !== $content_snapshot && null === $locale ) || ( null !== $layout_snapshot && null !== $locale ) ) {
			return PublishResult::error( 422, 'blixis_invalid_document' );
		}
		return $this->apply( $post_id, $actor, new PublishOptions( $expected, false, $locale, $confirm, false, $layout_snapshot, $content_snapshot, $this->site->default_locale() ) );
	}

	/**
	 * Check the rolling limit before storage and count successful writes only.
	 *
	 * @param int            $post_id Post ID.
	 * @param int            $actor WordPress user ID.
	 * @param PublishOptions $options Publication options.
	 */
	private function apply( int $post_id, int $actor, PublishOptions $options ): PublishResult {
		if ( null !== $this->limiter && $actor > 0 ) {
			$retry = $this->limiter->retry_after( $actor, $post_id );
			if ( $retry > 0 ) {
				return PublishResult::error( 429, 'blixis_rate_limited', [ 'retryAfter' => $retry ] );
			}
		}
		$result = $this->publisher->publish( $post_id, $options );
		if ( null === $result->code && null !== $this->limiter && $actor > 0 ) {
			$this->limiter->record( $actor, $post_id );
		}
		return $result;
	}

	/**
	 * Parse the required `If-Match` pointer revision.
	 *
	 * @param ?string $if_match Header value.
	 * @return int|PublishResult
	 */
	private function expected( ?string $if_match ): int|PublishResult {
		if ( null === $if_match || '' === $if_match ) {
			return PublishResult::error( 428, 'blixis_precondition_required' );
		}
		$revision = DocumentRequest::parse_if_match( $if_match );
		return $revision ?? PublishResult::error( 400, 'blixis_invalid_revision' );
	}

	/**
	 * Decode a small JSON object with only known keys.
	 *
	 * @param string        $body Body.
	 * @param array<string> $allowed Allowed keys.
	 * @return ?array<string, mixed>
	 */
	private function body( string $body, array $allowed ): ?array {
		if ( \strlen( $body ) > self::MAX_BODY ) {
			return null;
		}
		$data = '' === \trim( $body ) ? [] : \json_decode( $body, true, 4 );
		if ( ! \is_array( $data ) || ( [] !== $data && \array_is_list( $data ) ) || [] !== \array_diff( \array_keys( $data ), $allowed ) ) {
			return null;
		}
		return $data;
	}
}
