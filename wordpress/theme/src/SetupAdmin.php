<?php
/**
 * Appearance setup wizard.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/**
 * Permission-checked, server-rendered setup workflow.
 */
final class SetupAdmin {
	private const CAPABILITY   = 'edit_theme_options';
	private const NONCE_ACTION = 'blixis_setup_action';
	private const DRAFT_META   = 'blixis_setup_draft';
	private const STEP_NAMES   = [
		1 => 'Welcome',
		2 => 'Theme',
		3 => 'Style',
		4 => 'Style',
		5 => 'Content',
		6 => 'Finish',
	];
	private const PRESETS      = [
		'ocean'   => 'Ocean',
		'forest'  => 'Forest',
		'sunset'  => 'Sunset',
		'minimal' => 'Minimal',
		'custom'  => 'Custom',
	];

	/** Register admin hooks. */
	public static function register(): void {
		add_action( 'admin_menu', [ self::class, 'menu' ] );
		// Early: for a page that is no longer registered under Appearance, core answers 403 before `admin_init` runs.
		add_action( 'init', [ self::class, 'redirect_legacy_url' ], 0 );
		add_action( 'admin_enqueue_scripts', [ self::class, 'assets' ] );
		foreach ( [ 'start', 'dismiss', 'wizard', 'rollback' ] as $action ) {
			add_action( 'admin_post_blixis_setup_' . $action, [ self::class, $action ] );
		}
	}

	/**
	 * Load the setup page stylesheet without inline styles.
	 *
	 * @param string $hook Admin page hook.
	 */
	public static function assets( string $hook ): void {
		if ( in_array( $hook, [ 'appearance_page_blixis-setup', 'blixis_page_blixis-setup', 'toplevel_page_blixis' ], true ) ) {
			wp_enqueue_style( 'blixis-setup-admin', get_template_directory_uri() . '/assets/css/setup-admin.css', [], (string) filemtime( get_template_directory() . '/assets/css/setup-admin.css' ) );
		}
	}

	/** Add the wizard beneath the Builder menu when present, with a standalone fallback. */
	public static function menu(): void {
		$parent = apply_filters( 'blixis_builder_admin_menu_slug', '' );
		if ( is_string( $parent ) && '' !== $parent ) {
			return;
		}
		add_theme_page( __( 'Blixis setup', 'blixis' ), __( 'Blixis setup', 'blixis' ), self::CAPABILITY, 'blixis-setup', [ self::class, 'page' ] );
	}

	/** Preserve old Appearance bookmarks after plugin menu migration. */
	public static function redirect_legacy_url(): void {
		$parent = apply_filters( 'blixis_builder_admin_menu_slug', '' );
		$page   = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only legacy URL routing.
		if ( 'themes.php' !== ( $GLOBALS['pagenow'] ?? '' ) || 'blixis-setup' !== $page || ! is_string( $parent ) || '' === $parent ) {
			return; }
		// No capability check here: the destination page enforces it (and a logged-out visitor lands on the login screen).
		wp_safe_redirect( admin_url( 'admin.php?page=blixis-setup' ) );
		exit;
	}

	/** Render the current step; an explicit step query supports revisiting prior steps. */
	public static function page(): void {
		self::require_capability();
		$state          = SetupState::get();
		$user_id        = get_current_user_id();
		$resume         = SetupState::resume_step( $user_id );
		$requested      = isset( $_GET['step'] ) ? (int) $_GET['step'] : $resume; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only navigation.
		$step           = max( 1, min( $resume, $requested ) );
		$stored         = self::draft( $user_id );
		$catalogue      = SetupTemplates::catalogue();
		$first_id       = $catalogue[0]['id'] ?? 'ocean';
		$query_template = isset( $_GET['template'] ) ? sanitize_key( wp_unslash( $_GET['template'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only selected card from install redirect.
		$preset         = $stored['template'] ?? ( $stored['preset'] ?? ( SetupTemplates::find( $query_template ) ? $query_template : $first_id ) );
		$tokens         = $stored['tokens'] ?? ( null !== SetupTemplates::find( $preset ) ? SetupTemplates::tokens( SetupTemplates::find( $preset )['designTokens'], self::preset_tokens( 'custom' ) ?? [] ) : self::preset_tokens( $preset ) );
		$appearance     = $stored['appearance'] ?? Appearance::site_mode();
		$query_scheme   = isset( $_GET['scheme'] ) ? sanitize_key( wp_unslash( $_GET['scheme'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only install redirect value.
		$query_font     = isset( $_GET['font'] ) ? sanitize_key( wp_unslash( $_GET['font'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only install redirect value.
		$scheme         = $stored['scheme'] ?? ( 'template' === $query_scheme || self::find_choice( SetupChoices::schemes(), $query_scheme ) ? $query_scheme : 'template' );
		$font           = $stored['font'] ?? ( 'template' === $query_font || self::find_choice( SetupChoices::fonts(), $query_font ) ? $query_font : 'template' );
		if ( null === $tokens ) {
			$tokens = [];
		}
		$errors = get_user_meta( $user_id, 'blixis_setup_errors', true );
		$errors = \is_array( $errors ) ? $errors : [];
		delete_user_meta( $user_id, 'blixis_setup_errors' );
		if ( isset( $_GET['error'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed post-redirect error code.
			$code = sanitize_key( wp_unslash( $_GET['error'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only message.
			if ( 'contrast' === $code && ! $errors ) {
				$errors['tokens'] = __( 'Color contrast is too low.', 'blixis' );
			} elseif ( 'invalid' === $code ) {
				$errors = $errors ? $errors : [ 'tokens' => __( 'The submitted values were invalid. Check every field and try again.', 'blixis' ) ];
			} elseif ( 'not-saved' === $code ) {
				$errors['tokens'] = __( 'The design system could not be saved. Nothing was changed; try again.', 'blixis' );
			} elseif ( 'unavailable' === $code ) {
				$errors['tokens'] = __( 'The bundled design data is unavailable.', 'blixis' );
			}
		}
		if ( isset( $_GET['font_install'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed post-redirect notice.
			$errors['font'] = 'success' === sanitize_key( wp_unslash( $_GET['font_install'] ) ) ? __( 'Template fonts were installed. Continue to apply them.', 'blixis' ) : __( 'Template fonts could not be installed. The system font pairing will be used.', 'blixis' ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed non-sensitive status code set by the POST redirect.
		}
		?>
		<div class="wrap blx-setup-wrap"><header class="blx-setup-top"><a class="blx-setup-brand" href="<?php echo esc_url( home_url( '/' ) ); ?>"><span class="blx-setup-mark" aria-hidden="true">b</span><span>Blixis</span></a><div class="blx-setup-top-actions"><a class="button" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener"><?php echo esc_html__( 'View Site', 'blixis' ); ?></a></div></header>
		<main class="blixis-setup"><p class="blx-setup-eyebrow"><?php echo esc_html__( 'Setup Wizard', 'blixis' ); ?></p><h1><?php echo esc_html__( 'Welcome to', 'blixis' ); ?> <span>Blixis</span></h1>
		<p class="blx-setup-intro"><?php echo esc_html__( 'Let’s get your website ready in a few simple steps. Choose a starter design, customize the style, and import content. You can always change these settings later.', 'blixis' ); ?></p>
		<?php if ( in_array( $state['status'], [ 'not_started', 'dismissed' ], true ) && get_option( 'blixis_show_setup_notice', true ) ) : ?>
			<div class="blx-setup-banner"><p><?php echo esc_html__( 'Set up the Blixis theme when you are ready.', 'blixis' ); ?></p>
				<?php self::action_form( 'start', __( 'Start setup', 'blixis' ), 'button button-primary blx-banner-start' ); ?>
				<?php self::action_form( 'dismiss', __( 'Dismiss', 'blixis' ), 'button-link blx-banner-dismiss' ); ?>
			</div>
		<?php endif; ?>
		<nav class="blx-stepper" aria-label="<?php echo esc_attr__( 'Setup steps', 'blixis' ); ?>"><ol aria-live="polite">
			<?php
			$active_number = 1 === $step ? 1 : ( 2 === $step ? 2 : ( $step <= 4 ? 3 : ( 5 === $step ? 4 : 5 ) ) );
			foreach ( [
				1 => __( 'Welcome', 'blixis' ),
				2 => __( 'Theme', 'blixis' ),
				3 => __( 'Style', 'blixis' ),
				4 => __( 'Content', 'blixis' ),
				5 => __( 'Finish', 'blixis' ),
			] as $number => $title ) :
				$current  = $active_number === $number;
				$complete = $number < $active_number;
				?>
				<li class="<?php echo $complete ? 'is-complete' : ''; ?>" <?php echo $current ? 'aria-current="step"' : ''; ?>><span><?php echo esc_html( $complete ? '✓' : (string) $number ); ?></span><span class="blx-step-label"><?php echo esc_html( $title ); ?></span></li>
			<?php endforeach; ?>
			</ol></nav>
			<?php
			$step_title = match ( $step ) {
				1       => __( 'Choose a starter design', 'blixis' ),
				2       => __( 'Select your theme foundation', 'blixis' ),
				3, 4    => __( 'Style your website', 'blixis' ),
				5       => __( 'Add Your Content', 'blixis' ),
				6       => __( 'Setup Complete!', 'blixis' ),
				default => __( 'Make it yours', 'blixis' ),
			};
		?>
			<section class="blx-step-content<?php echo 1 === $step ? ' blx-step-content--welcome' : ''; ?>" aria-labelledby="blx-step-title">
			<?php
			if ( 1 !== $step ) :
				?>
				<h2 id="blx-step-title"><?php echo esc_html( $step_title ); ?></h2><?php endif; ?>
			<?php
			if ( 5 === $step ) :
				?>
				<p class="blx-section-help"><?php echo esc_html__( 'Import demo content to get a head start. You can choose what to import and adjust these settings later.', 'blixis' ); ?></p><?php endif; ?>
			<?php
			if ( $errors ) :
				?>
				<div role="alert" class="notice notice-error"><p><?php echo esc_html__( 'Please correct these fields:', 'blixis' ); ?></p><ul>
				<?php
				foreach ( $errors as $field => $message ) :
					?>
					<li><a href="#<?php echo esc_attr( $field ); ?>"><?php echo esc_html( $message ); ?></a></li><?php endforeach; ?>
			</ul></div><?php endif; ?>
			<?php
			if ( 6 === $step ) :
				$scheme_choice = self::find_choice( SetupChoices::schemes(), $scheme );
				$font_choice   = self::find_choice( SetupChoices::fonts(), $font );
				$template      = SetupTemplates::find( $preset );
				$template_name = $template['name'] ?? ( self::PRESETS[ $preset ] ?? $preset );
				$scheme_name   = 'template' === $scheme ? $template_name : ( $scheme_choice['label'] ?? '' );
				$font_name     = 'template' === $font ? __( 'Template fonts', 'blixis' ) : ( $font_choice['label'] ?? '' );
				?>
				<p><?php echo esc_html__( 'Your website is ready to launch. The selected design and style settings will be applied to your site.', 'blixis' ); ?></p><section class="blx-finish-summary"><h3><?php echo esc_html__( 'Your choices', 'blixis' ); ?></h3><p><?php echo esc_html( $template_name ); ?> · <?php echo esc_html( self::choice_text( (string) $scheme_name ) ); ?> · <?php echo esc_html( (string) $font_name ); ?> · <?php echo esc_html( self::choice_text( ucfirst( $appearance ) ) ); ?></p></section><?php endif; ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="blixis_setup_wizard"><input type="hidden" name="step" value="<?php echo esc_attr( (string) $step ); ?>">
				<?php wp_nonce_field( 'blixis_setup_step_' . $step, 'blixis_setup_nonce_wizard' ); ?>
				<?php
				if ( 1 === $step && SetupTemplates::find( $preset ) ) :
					?>
					<input type="hidden" name="template_id" value="<?php echo esc_attr( $preset ); ?>"><?php wp_nonce_field( 'template_font_install', 'template_font_nonce' ); ?><?php endif; ?>
				<?php self::fields( $step, $preset, $tokens, $appearance, $scheme, $font ); ?>
			</section><footer class="blx-setup-footer">
				<?php
				if ( $step > 1 ) :
					?>
					<button class="button" type="submit" name="direction" value="back"><?php echo esc_html__( 'Back', 'blixis' ); ?></button>
					<?php
					else :
						?>
																							<button class="button" type="submit" name="direction" value="cancel"><span aria-hidden="true">←</span> <?php echo esc_html__( 'Skip Setup', 'blixis' ); ?></button><span class="blx-skip-hint"><?php echo esc_html__( 'You can access the setup wizard anytime from the Blixis menu.', 'blixis' ); ?></span><?php endif; ?>
				<?php
				if ( $step < 6 ) :
					?>
					<button class="button button-primary blx-continue" type="submit" name="direction" value="next"><?php echo esc_html__( 'Continue', 'blixis' ); ?> <span aria-hidden="true">→</span></button>
					<?php
else :
	?>
					<button class="button button-primary" type="submit" name="direction" value="apply"><?php echo esc_html__( 'Apply', 'blixis' ); ?></button><?php endif; ?>
				</footer>
			</form>
			<?php self::saved_panel(); ?>
		</main></div>
		<?php
	}

	/** Render template, palette and font choices from the optional provider.
	 *
	 * @param string $selected Selected template identifier.
	 * @param string $scheme Selected color scheme identifier.
	 * @param string $font Selected font pairing identifier.
	 */
	private static function template_choices( string $selected, string $scheme, string $font ): void {
		$templates = SetupTemplates::catalogue();
		if ( ! $templates ) {
			echo '<p class="notice notice-info">' . esc_html__( 'No starter designs are available right now.', 'blixis' ) . '</p>';
			return;
		}
		$categories      = [];
		$category_labels = [
			'real-estate' => __( 'Real estate', 'blixis' ),
			'agency'      => __( 'Agency', 'blixis' ),
			'corporate'   => __( 'Corporate', 'blixis' ),
			'ecommerce'   => __( 'Ecommerce', 'blixis' ),
			'business'    => __( 'Business', 'blixis' ),
			'blog'        => __( 'Blog', 'blixis' ),
		];
		foreach ( $templates as $template ) {
			$categories[ $template['category'] ] = true;
		}
		$filter            = isset( $_GET['category'] ) ? sanitize_key( wp_unslash( $_GET['category'] ) ) : 'all'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only category filter.
		$selected_template = null;
		foreach ( $templates as $candidate ) {
			if ( $candidate['id'] === $selected ) {
				$selected_template = $candidate;
				break;
			}
		}
		echo '<div class="blx-template-heading"><div><h2 id="blx-step-title">' . esc_html__( 'Choose a starter design', 'blixis' ) . '</h2><p class="description">' . esc_html__( 'These professionally designed templates give you a head start. You can customize everything after setup.', 'blixis' ) . '</p></div>';
		$templates_url = apply_filters( 'blixis_builder_templates_admin_url', '' );
		if ( is_string( $templates_url ) && '' !== $templates_url ) {
			printf( '<a class="button" href="%s">%s</a>', esc_url( $templates_url ), esc_html__( 'View All Templates', 'blixis' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped URL and label.
		}
		echo '</div><nav class="blx-category-filters" aria-label="' . esc_attr__( 'Template categories', 'blixis' ) . '"><a class="' . ( 'all' === $filter ? 'is-active' : '' ) . '" href="' . esc_url( admin_url( 'admin.php?page=blixis-setup&step=1' ) ) . '">' . esc_html__( 'All', 'blixis' ) . '</a>';
		foreach ( array_keys( $categories ) as $category ) {
			$url = add_query_arg(
				[
					'page'     => 'blixis-setup',
					'step'     => 1,
					'category' => $category,
				],
				admin_url( 'admin.php' )
			);
			printf( '<a class="%s" href="%s">%s</a>', $filter === $category ? 'is-active' : '', esc_url( $url ), esc_html( $category_labels[ $category ] ?? ucfirst( str_replace( '-', ' ', $category ) ) ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
		}
		echo '</nav><fieldset class="blx-preset-grid"><legend class="screen-reader-text">' . esc_html__( 'Choose a starter design', 'blixis' ) . '</legend><div class="blx-preset-cards" role="radiogroup" aria-label="' . esc_attr__( 'Starter designs', 'blixis' ) . '">';
		foreach ( $templates as $template ) {
			if ( 'all' !== $filter && $filter !== $template['category'] ) {
				continue;
			}
			$id             = $template['id'];
			$preview        = $template['previewUrl'];
			$preview_markup = '' !== $preview ? '<img src="' . esc_url( $preview ) . '" alt="" loading="lazy">' : '';
			if ( '' === $preview && isset( $template['fallbackPreset'] ) ) {
				$fallback_tokens = self::preset_tokens( $template['fallbackPreset'] );
				if ( null !== $fallback_tokens ) {
					$style          = self::mock_style( $fallback_tokens );
					$preview_markup = '<span class="blx-template-mini" style="' . esc_attr( $style ) . '" aria-hidden="true"><span class="blx-mini-header"><i></i><span><i></i><i></i><i></i></span></span><span class="blx-mini-hero"><strong></strong><small></small><em></em></span><span class="blx-mini-content"><i></i><i></i><i></i></span></span>';
				}
			}
			$category_label = $category_labels[ $template['category'] ] ?? ucfirst( str_replace( '-', ' ', $template['category'] ) );
			$description_id = 'blx-template-description-' . sanitize_html_class( $id );
			printf( '<label class="blx-preset-card%s" data-template="%s"><input type="radio" name="preset" value="%s" aria-describedby="%s" %s><span class="blx-preset-preview">%s</span><span class="blx-preset-title">%s</span><span class="blx-preset-category">%s</span><span class="screen-reader-text" id="%s">%s</span><span class="blx-selected" aria-hidden="true">✓</span></label>', checked( $selected, $id, false ) ? ' is-selected' : '', esc_attr( $id ), esc_attr( $id ), esc_attr( $description_id ), checked( $selected, $id, false ), $preview_markup, esc_html( $template['name'] ), esc_html( $category_label ), esc_attr( $description_id ), esc_html( $template['description'] ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Dynamic values escaped.
		}
		echo '</div></fieldset><section class="blx-choice-columns"><fieldset class="blx-choice-group"><legend>' . esc_html__( 'Color scheme', 'blixis' ) . '</legend><p class="description">' . esc_html__( 'Choose a color palette for your site. You can fine-tune these later in Global Styles.', 'blixis' ) . '</p><div class="blx-scheme-cards" role="radiogroup" aria-label="' . esc_attr__( 'Color schemes', 'blixis' ) . '">';
		if ( null !== $selected_template ) {
			$seed     = SetupTemplates::tokens( $selected_template['designTokens'], self::preset_tokens( 'custom' ) ?? [] );
			$swatches = $seed;
			printf( '<label class="blx-scheme-card"><input type="radio" name="scheme" value="template" %s><span class="blx-swatches" aria-hidden="true"><i style="--swatch:%s"></i><i style="--swatch:%s"></i><i style="--swatch:%s"></i><i style="--swatch:%s"></i></span><strong>%s</strong><small>%s</small></label>', checked( $scheme, 'template', false ), esc_attr( $swatches['color-primary']['value'] ), esc_attr( $swatches['color-link']['value'] ), esc_attr( $swatches['color-text']['value'] ), esc_attr( $swatches['color-muted']['value'] ), esc_html( $selected_template['name'] ), esc_html__( 'Template palette', 'blixis' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Validated token values and escaped text.
		}
		foreach ( SetupChoices::schemes() as $choice ) {
			$swatches = $choice['tokens'];
			printf( '<label class="blx-scheme-card"><input type="radio" name="scheme" value="%s" %s><span class="blx-swatches" aria-hidden="true"><i style="--swatch:%s"></i><i style="--swatch:%s"></i><i style="--swatch:%s"></i><i style="--swatch:%s"></i></span><strong>%s</strong><small>%s</small></label>', esc_attr( $choice['id'] ), checked( $scheme, $choice['id'], false ), esc_attr( $swatches['color-primary']['value'] ), esc_attr( $swatches['color-link']['value'] ), esc_attr( $swatches['color-text']['value'] ), esc_attr( $swatches['color-muted']['value'] ), esc_html( self::choice_text( $choice['label'] ) ), esc_html( self::choice_text( $choice['descriptor'] ) ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Validated bundled choices.
		}
		echo '</div></fieldset><fieldset class="blx-choice-group"><legend>' . esc_html__( 'Font selection', 'blixis' ) . '</legend><p class="description">' . esc_html__( 'Pick a font pairing for your website.', 'blixis' ) . '</p><div class="blx-font-select-card" role="radiogroup" aria-label="' . esc_attr__( 'Font pairings', 'blixis' ) . '">';
		$font_template = $selected_template;
		if ( null !== $font_template ) {
			$families        = is_array( $font_template['fonts'] ?? null ) ? $font_template['fonts'] : [];
			$names           = array_values( array_filter( array_map( static fn ( $entry ) => is_array( $entry ) && is_string( $entry['family'] ?? null ) ? $entry['family'] : null, $families ) ) );
			$installed_names = array_column( FontLibrary::installed(), 'name' );
			$available       = $names && count( array_diff( $names, $installed_names ) ) === 0;
			printf( '<div class="blx-font-template%s"><label class="blx-font-option blx-font-option--template"><input type="radio" name="font" value="template" %s><strong aria-hidden="true">Aa</strong><span><b>%s</b><small>%s</small><small class="blx-font-status">%s</small></span><span class="blx-font-chevron" aria-hidden="true">⌄</span></label>', $available ? ' is-installed' : ' is-not-installed', checked( $font, 'template', false ), esc_html( $names ? implode( ' + ', $names ) : __( 'System font pairing', 'blixis' ) ), esc_html__( 'Clean & modern (Recommended)', 'blixis' ), esc_html( $available ? __( 'Installed', 'blixis' ) : __( 'Not installed', 'blixis' ) ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped values.
			if ( $names && ! $available ) {
				printf( '<button class="button blx-font-install" type="submit" formaction="%s" name="action" value="blixis_install_template_fonts">%s</button>', esc_url( admin_url( 'admin-post.php' ) ), esc_html__( 'Install font', 'blixis' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped URL and label.
			}
			echo '</div>';
		}
		foreach ( SetupChoices::fonts() as $choice ) {
			printf( '<label class="blx-font-option blx-font-option--small"><input type="radio" name="font" value="%s" %s><strong aria-hidden="true" style="font-family:%s">Aa</strong><span><b>%s</b><small>%s</small></span></label>', esc_attr( $choice['id'] ), checked( $font, $choice['id'], false ), esc_attr( $choice['heading'] ), esc_html( self::choice_text( $choice['label'] ) ), esc_html( self::choice_text( $choice['descriptor'] ) ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Validated local choices.
		}
		echo '</div></fieldset></section>';
	}

	/**
	 * Render fields for a wizard step.
	 *
	 * @param int                  $step Step.
	 * @param string               $preset Preset.
	 * @param array<string, mixed> $tokens Draft.
	 * @param string               $appearance Site appearance draft.
	 * @param string               $scheme Selected color scheme.
	 * @param string               $font Selected font pairing.
	 */
	private static function fields( int $step, string $preset, array $tokens, string $appearance, string $scheme = 'primary', string $font = 'system' ): void {
		if ( 1 === $step ) {
			self::template_choices( $preset, $scheme, $font );
		} elseif ( 2 === $step ) {
			self::foundation_placeholders();
		} elseif ( \in_array( $step, [ 3, 4 ], true ) ) {
			echo '<fieldset><legend>' . esc_html( self::STEP_NAMES[ $step ] ) . '</legend>';
			foreach ( $tokens as $name => $entry ) {
				if ( ! \is_string( $name ) ) {
					continue;
				}
				if ( ( 3 === $step && ! \in_array( $name, [ 'font-body', 'font-heading', 'text-base' ], true ) ) || ( 4 === $step && ! ( str_starts_with( $name, 'space-' ) || str_starts_with( $name, 'radius-' ) || str_starts_with( $name, 'container-' ) ) ) ) {
					continue;
				}
				if ( 3 === $step && str_starts_with( $name, 'font-' ) ) {
					$legend = 'font-body' === $name ? __( 'Body font', 'blixis' ) : __( 'Heading font', 'blixis' );
					echo '<fieldset class="blx-font-choices"><legend>' . esc_html( $legend ) . '</legend><div class="blx-font-cards">';
					foreach ( TokenDraft::options( $name, $entry['value'], FontLibrary::allowed_stacks() ) as $font ) {
						$font_label = $font;
						foreach ( FontLibrary::installed() as $family ) {
							if ( FontLibrary::css_stack( $family['css_family'], 'sans-serif' ) === $font ) {
								$variants   = array_map( static fn ( array $face ): string => $face['weight'] . ' ' . $face['style'], $family['faces'] );
								$font_label = $family['name'] . ( $variants ? ' (' . implode( ', ', $variants ) . ')' : '' );
								break;
							}
						}
						printf( '<label class="blx-font-card"><input type="radio" name="tokens[%s][value]" value="%s" %s><strong aria-hidden="true">Aa</strong><span>%s</span></label>', esc_attr( $name ), esc_attr( $font ), checked( $entry['value'], $font, false ), esc_html( $font_label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped values.
					}
					echo '</div></fieldset>';
					continue;
				}
				foreach ( str_starts_with( $name, 'color-' ) ? [ 'value', 'dark' ] : [ 'value' ] as $mode ) {
					$id    = $name . '-' . $mode;
					$label = $name . ( 'dark' === $mode ? ' (dark)' : ' (light/base)' );
					printf( '<label for="%s">%s</label>', esc_attr( $id ), esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
					if ( str_starts_with( $name, 'color-' ) ) {
						printf( '<input id="%s" type="text" name="tokens[%s][%s]" value="%s" maxlength="7" pattern="#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}" required>', esc_attr( $id ), esc_attr( $name ), esc_attr( $mode ), esc_attr( $entry[ $mode ] ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
					} else {
						printf( '<select id="%s" name="tokens[%s][%s]">', esc_attr( $id ), esc_attr( $name ), esc_attr( $mode ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
						if ( str_starts_with( $name, 'font-' ) ) {
							$seed = self::preset_tokens( $preset );
							self::font_options( $name, $entry[ $mode ], $seed[ $name ]['value'] ?? $entry['value'] );
						} else {
							foreach ( TokenDraft::options( $name, $entry['value'] ) as $option ) {
								printf( '<option value="%s" %s>%s</option>', esc_attr( $option ), selected( $entry[ $mode ], $option, false ), esc_html( $option ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
							}
						}
						echo '</select>';
					}
				}
			}
			echo '</fieldset>';
			if ( 3 === $step && [] === FontLibrary::installed() ) {
				printf( '<p class="notice notice-info">%s <a href="%s">%s</a></p>', esc_html__( 'No Font Library families are installed.', 'blixis' ), esc_url( admin_url( 'font-library.php' ) ), esc_html__( 'Open Appearance > Fonts', 'blixis' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
			}
			if ( 3 === $step ) {
				echo '<fieldset class="blx-appearance-choices"><legend>' . esc_html__( 'Appearance', 'blixis' ) . '</legend><p class="description">' . esc_html__( 'Choose your default color mode. Visitors can still switch modes later.', 'blixis' ) . '</p>';
				foreach ( [
					'auto'  => __( 'Auto', 'blixis' ),
					'light' => __( 'Light', 'blixis' ),
					'dark'  => __( 'Dark', 'blixis' ),
				] as $mode => $label ) {
					printf( '<label><input type="radio" name="appearance" value="%s" %s> %s</label>', esc_attr( $mode ), checked( $appearance, $mode, false ), esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
				}
				echo '</fieldset>';
			}
		} elseif ( 5 === $step ) {
			self::content_choices( $preset );
		}
	}

	/** Show screenshot-shaped foundation controls as disabled while no persistence backend exists.
	 *
	 * @return void
	 */
	private static function foundation_placeholders(): void {
		echo '<div class="blx-foundation-grid">';
		foreach ( [
			__( 'Header style', 'blixis' )    => [ __( 'Modern Header', 'blixis' ), __( 'Minimal Header', 'blixis' ), __( 'Centered Header', 'blixis' ) ],
			__( 'Footer style', 'blixis' )    => [ __( 'Modern Footer', 'blixis' ), __( 'Minimal Footer', 'blixis' ), __( 'Centered Footer', 'blixis' ) ],
			__( 'Container width', 'blixis' ) => [ __( 'Boxed', 'blixis' ), __( 'Wide', 'blixis' ), __( 'Full Width', 'blixis' ) ],
			__( 'Starter layout', 'blixis' )  => [ __( 'Business', 'blixis' ), __( 'Portfolio', 'blixis' ), __( 'Online Store', 'blixis' ) ],
		] as $group => $options ) {
			echo '<fieldset class="blx-foundation-card" disabled><legend>' . esc_html( $group ) . '</legend><div>';
			foreach ( $options as $option ) {
				printf( '<label><input type="radio" disabled> %s</label>', esc_html( $option ) );
			}
			echo '</div><p>' . esc_html__( 'Coming soon: this template setting does not have an apply backend yet.', 'blixis' ) . '</p></fieldset>';
		}
		echo '</div>';
	}

	/** Render honest, disabled import cards with pack-provided refusal reasons.
	 *
	 * @param string $template_id Selected template identifier.
	 * @return void
	 */
	private static function content_choices( string $template_id ): void {
		$template = SetupTemplates::find( $template_id );
		if ( null === $template ) {
			echo '<div class="blx-content-later"><p>' . esc_html__( 'Content import is not available for this starter design yet.', 'blixis' ) . '</p></div>';
			return;
		}
		$documents = is_array( $template['documents'] ?? null ) ? $template['documents'] : [];
		if ( ! $documents ) {
			echo '<div class="blx-content-later"><p>' . esc_html__( 'This template does not include importable content.', 'blixis' ) . '</p></div>';
			return;
		}
		echo '<div class="blx-content-grid">';
		foreach ( $documents as $document ) {
			if ( ! is_array( $document ) || ! is_string( $document['title'] ?? null ) ) {
				continue;
			}
			$reasons = is_array( $document['importabilityReasons'] ?? null ) ? $document['importabilityReasons'] : [];
			printf( '<article class="blx-content-card"><h3>%s</h3><p>%s</p><p><strong>%s</strong></p>', esc_html( $document['title'] ), esc_html( (string) ( $document['type'] ?? '' ) ), esc_html__( 'Import is not available for this template yet.', 'blixis' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped pack strings.
			if ( $reasons ) {
				echo '<ul>';
				foreach ( $reasons as $reason ) {
					if ( is_string( $reason ) ) {
						echo '<li>' . esc_html( $reason ) . '</li>';
					}
				}
				echo '</ul>';
			}
			echo '</article>';
		}
		echo '</div>';
	}

	/**
	 * Render installed and system font choices with their available variants.
	 *
	 * @param string $name Token name.
	 * @param string $selected_value Current selection.
	 * @param string $bundled_value Preset default.
	 */
	private static function font_options( string $name, string $selected_value, string $bundled_value ): void {
		$families = FontLibrary::installed();
		if ( $families ) {
			echo '<optgroup label="' . esc_attr__( 'Installed fonts', 'blixis' ) . '">';
			foreach ( $families as $family ) {
				$stack = FontLibrary::css_stack( $family['css_family'], 'sans-serif' );
				if ( null === $stack ) {
					continue;
				}
				$variants = \array_map( static fn ( array $face ): string => $face['weight'] . ' ' . $face['style'], $family['faces'] );
				$label    = $family['name'] . ( $variants ? ' (' . \implode( ', ', $variants ) . ')' : '' );
				printf( '<option value="%s" %s>%s</option>', esc_attr( $stack ), selected( $selected_value, $stack, false ), esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
			}
			echo '</optgroup>';
		}
		echo '<optgroup label="' . esc_attr__( 'System fonts', 'blixis' ) . '">';
		foreach ( TokenDraft::options( $name, $bundled_value ) as $option ) {
			printf( '<option value="%s" %s>%s</option>', esc_attr( $option ), selected( $selected_value, $option, false ), esc_html( $option ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped substitutions.
		}
		echo '</optgroup>';
	}

	/** Start or resume setup. */
	public static function start(): void {
		self::handle_entry( 'start' );
	}

	/** Dismiss the notice. */
	public static function dismiss(): void {
		self::handle_entry( 'dismiss' );
	}

	/**
	 * Handle a start or dismiss action.
	 *
	 * @param string $action Entry action.
	 */
	private static function handle_entry( string $action ): void {
		self::require_post();
		check_admin_referer( self::NONCE_ACTION, 'blixis_setup_nonce_' . $action );
		$next = SetupState::transition( get_option( SetupState::OPTION, false ), $action, gmdate( DATE_ATOM ) );
		if ( null !== $next ) {
			update_option( SetupState::OPTION, $next, false );
		}
		if ( 'dismiss' === $action ) {
			update_option( 'blixis_show_setup_notice', false, false );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=blixis-setup' ) );
		exit;
	}

	/** Show the saved design system, a confirmation after applying and the restore form. */
	private static function saved_panel(): void {
		$saved = DesignSystemStore::current();
		if ( isset( $_GET['applied'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed post-redirect message.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'The design system was saved.', 'blixis' ) . '</p></div>';
		}
		if ( isset( $_GET['restored'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Fixed post-redirect message.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'The previous design system was restored.', 'blixis' ) . '</p></div>';
		}
		if ( null === $saved ) {
			return;
		}
		?>
		<aside class="blx-saved-panel"><p class="blx-saved-summary">
		<?php
		$saved_timestamp = strtotime( $saved['updated_at'] );
		if ( false === $saved_timestamp ) {
			$saved_timestamp = time();
		}
		$saved_date = wp_date( (string) get_option( 'date_format' ), $saved_timestamp );
		if ( false === $saved_date ) {
			$saved_date = '';
		}
		/* translators: 1: preset, 2: version number, 3: date. */
		printf( esc_html__( 'Current design: %1$s, version %2$s, saved %3$s', 'blixis' ), esc_html( self::choice_text( self::PRESETS[ $saved['preset'] ] ?? $saved['preset'] ) ), esc_html( (string) $saved['tokenVersion'] ), esc_html( $saved_date ) );
		?>
		</p>
		<?php
		if ( [] !== DesignSystemStore::history() ) {
			self::action_form( 'rollback', __( 'Restore previous version', 'blixis' ), 'button-link blx-restore-link' );
		}
		echo '</aside>';
	}

	/** Restore the previous design system. */
	public static function rollback(): void {
		self::require_post();
		check_admin_referer( self::NONCE_ACTION, 'blixis_setup_nonce_rollback' );
		$result = DesignSystemStore::rollback();
		wp_safe_redirect( admin_url( 'admin.php?page=blixis-setup' . ( $result['ok'] ? '&restored=1' : '&error=not-saved' ) ) );
		exit;
	}

	/** Handle a wizard POST. */
	public static function wizard(): void {
		self::require_post();
		$step = isset( $_POST['step'] ) ? (int) $_POST['step'] : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked below.
		if ( $step < 1 || $step > 6 ) {
			wp_die( esc_html__( 'Invalid step.', 'blixis' ), '', [ 'response' => 400 ] );
		}
		check_admin_referer( 'blixis_setup_step_' . $step, 'blixis_setup_nonce_wizard' );
		$user_id = get_current_user_id();
		if ( $step > SetupState::resume_step( $user_id ) ) {
			wp_die( esc_html__( 'Step is unavailable.', 'blixis' ), '', [ 'response' => 403 ] );
		}
		$direction = isset( $_POST['direction'] ) ? sanitize_key( wp_unslash( $_POST['direction'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
		if ( 'cancel' === $direction ) {
			$state = SetupState::transition( get_option( SetupState::OPTION, false ), 'dismiss', gmdate( DATE_ATOM ) );
			if ( null !== $state ) {
				update_option( SetupState::OPTION, $state, false );
			}
			wp_safe_redirect( admin_url( 'admin.php?page=blixis-setup' ) );
			exit;
		}
		if ( 'back' === $direction ) {
			$previous = SetupState::next_step( $step, 'back' );
			if ( null !== $previous ) {
				SetupState::save_resume_step( $user_id, $previous );
				self::redirect_step( $previous );
			}
		}
		if ( ! \in_array( $direction, [ 'next', 'apply' ], true ) || ( 'apply' === $direction ) !== ( 6 === $step ) ) {
			wp_die( esc_html__( 'Invalid action.', 'blixis' ), '', [ 'response' => 400 ] );
		}
		$draft = self::draft( $user_id );
		if ( 1 === $step ) {
			$preset   = isset( $_POST['preset'] ) ? sanitize_key( wp_unslash( $_POST['preset'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
			$template = SetupTemplates::find( $preset );
			$fallback = null;
			foreach ( SetupTemplates::fallback() as $fallback_item ) {
				if ( $fallback_item['id'] === $preset ) {
					$fallback = $fallback_item;
				}
			}
			if ( ! isset( self::PRESETS[ $preset ] ) && null === $template && null === $fallback ) {
				self::redirect_step( $step, 'invalid' );
			}
			$seed_preset = isset( self::PRESETS[ $preset ] ) ? $preset : 'custom';
			$tokens      = null !== $template ? SetupTemplates::tokens( $template['designTokens'], self::preset_tokens( 'custom' ) ?? [] ) : ( null !== $fallback ? self::preset_tokens( $preset ) : self::preset_tokens( $preset ) );
			if ( null === $tokens ) {
				self::redirect_step( $step, 'unavailable' );
			}
			$scheme        = isset( $_POST['scheme'] ) ? sanitize_key( wp_unslash( $_POST['scheme'] ) ) : '';
			$font          = isset( $_POST['font'] ) ? sanitize_key( wp_unslash( $_POST['font'] ) ) : '';
			$chosen_tokens = SetupChoices::apply_to_tokens( $tokens, 'template' === $scheme ? 'primary' : $scheme, 'template' === $font ? 'system' : $font, FontLibrary::allowed_stacks() );
			if ( null !== $chosen_tokens && 'template' === $font ) {
				$selected_pack = SetupTemplates::find( $preset );
				$families      = is_array( $selected_pack['fonts'] ?? null ) ? array_values( $selected_pack['fonts'] ) : [];
				$installed     = FontLibrary::installed();
				if ( count( $families ) >= 2 ) {
					$stacks = [];
					foreach ( array_slice( $families, 0, 2 ) as $family ) {
						$stack = null;
						foreach ( $installed as $installed_family ) {
							if ( ( $family['family'] ?? null ) === $installed_family['name'] ) {
								$stack = FontLibrary::css_stack( $installed_family['css_family'], 'sans-serif' );
								break;
							}
						}
						$stacks[] = $stack;
					}
					if ( null !== $stacks[0] && null !== $stacks[1] ) {
						$chosen_tokens['font-heading']['value'] = $stacks[0];
						$chosen_tokens['font-body']['value']    = $stacks[1];
					}
				}
			}
			if ( null !== $chosen_tokens && 'template' === $scheme ) {
				foreach ( $tokens as $token_name => $token_value ) {
					if ( str_starts_with( (string) $token_name, 'color-' ) ) {
						$chosen_tokens[ $token_name ] = $token_value;
					}
				}
				if ( TokenDraft::validate( $chosen_tokens, $tokens, FontLibrary::allowed_stacks() ) ) {
					$chosen_tokens = null;
				}
			}
			if ( null === $chosen_tokens ) {
				self::redirect_step( $step, 'invalid' );
			}
			$tokens = $chosen_tokens;
			$draft  = [
				'preset'     => $seed_preset,
				'template'   => $preset,
				'scheme'     => $scheme,
				'font'       => $font,
				'tokens'     => $tokens,
				'appearance' => $draft['appearance'] ?? Appearance::site_mode(),
			];
		} elseif ( null === $draft ) {
			self::redirect_step( 1, 'invalid' );
		} elseif ( \in_array( $step, [ 3, 4 ], true ) ) {
			$submitted = isset( $_POST['tokens'] ) ? wp_unslash( $_POST['tokens'] ) : []; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
			if ( ! \is_array( $submitted ) || \strlen( (string) wp_json_encode( $submitted ) ) > TokenDraft::MAX_BYTES ) {
				self::redirect_step( $step, 'invalid' );
			}
			$tokens  = $draft['tokens'];
			$allowed = self::editable_names( $step, $tokens );
			if ( \array_diff( \array_keys( $submitted ), $allowed ) || \array_diff( $allowed, \array_keys( $submitted ) ) ) {
				self::redirect_step( $step, 'invalid' );
			}
			foreach ( $submitted as $name => $entry ) {
				$tokens[ $name ] = $entry;
			}
			$seed   = self::preset_tokens( $draft['preset'] );
			$errors = null === $seed ? [ 'tokens' => 'Unavailable' ] : TokenDraft::validate( $tokens, $seed, FontLibrary::allowed_stacks() );
			if ( $errors ) {
				update_user_meta( $user_id, 'blixis_setup_errors', $errors );
				self::redirect_step( $step, \count( TokenDraft::contrast_errors( $tokens ) ) ? 'contrast' : 'invalid' );
			}
			$draft['tokens'] = $tokens;
			if ( 3 === $step ) {
				$appearance = isset( $_POST['appearance'] ) ? wp_unslash( $_POST['appearance'] ) : null; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked above.
				if ( ! \is_string( $appearance ) || ! \in_array( $appearance, [ 'auto', 'light', 'dark' ], true ) ) {
					self::redirect_step( $step, 'invalid' );
				}
				$draft['appearance'] = $appearance;
			}
		}
		if ( 6 === $step ) {
			$seed = self::preset_tokens( $draft['preset'] );
			if ( null === $seed || TokenDraft::validate( $draft['tokens'], $seed, FontLibrary::allowed_stacks() ) ) {
				self::redirect_step( 6, 'invalid' );
			}
			$result = DesignSystemStore::apply( $draft['tokens'], $draft['preset'], $draft['appearance'] );
			if ( ! $result['ok'] ) {
				self::redirect_step( 6, 'not-saved' );
			}
			// Setup counts as completed only after the design system was persisted.
			$state = SetupState::transition( get_option( SetupState::OPTION, false ), 'complete', gmdate( DATE_ATOM ) );
			if ( null !== $state ) {
				update_option( SetupState::OPTION, $state, false );
			}
			delete_user_meta( $user_id, self::DRAFT_META );
			SetupState::save_resume_step( $user_id, 1 );
			wp_safe_redirect( admin_url( 'admin.php?page=blixis-setup&applied=1' ) );
			exit;
		} else {
			self::save_draft( $user_id, $draft );
			$state = SetupState::transition( get_option( SetupState::OPTION, false ), 'start', gmdate( DATE_ATOM ) );
			if ( null !== $state ) {
				update_option( SetupState::OPTION, $state, false );
			}
			$following = SetupState::next_step( $step, 'next' );
			if ( null !== $following ) {
				SetupState::save_resume_step( $user_id, $following );
				self::redirect_step( $following );
			}
		}
	}

	/**
	 * List token names editable at a step.
	 *
	 * @param int                  $step Step.
	 * @param array<string, mixed> $tokens Tokens.
	 * @return list<string> Editable names.
	 */
	private static function editable_names( int $step, array $tokens ): array {
		return \array_values(
			\array_filter(
				\array_keys( $tokens ),
				static function ( string $name ) use ( $step ): bool {
					return ( 3 === $step && \in_array( $name, [ 'font-body', 'font-heading', 'text-base' ], true ) ) || ( 4 === $step && ( str_starts_with( $name, 'space-' ) || str_starts_with( $name, 'radius-' ) || str_starts_with( $name, 'container-' ) ) );
				}
			)
		);
	}

	/**
	 * Read a validated per-user draft.
	 *
	 * @param int $user_id User ID.
	 * @return array{preset: string, tokens: array<string, mixed>, appearance: string}|null Draft.
	 */
	private static function draft( int $user_id ): ?array {
		$raw = get_user_meta( $user_id, self::DRAFT_META, true );
		if ( ! \is_string( $raw ) || \strlen( $raw ) > TokenDraft::MAX_BYTES ) {
			return null;
		}
		$data = json_decode( $raw, true );
		if ( ! \is_array( $data ) || ! \is_string( $data['preset'] ?? null ) || ! isset( self::PRESETS[ $data['preset'] ] ) || ( \array_key_exists( 'template', $data ) && ( ! is_string( $data['template'] ) || ( null === SetupTemplates::find( $data['template'] ) && ! in_array( $data['template'], array_column( SetupTemplates::fallback(), 'id' ), true ) ) ) ) || ( \array_key_exists( 'appearance', $data ) && Appearance::normalize( $data['appearance'] ) !== $data['appearance'] ) ) {
			return null;
		}
		$data['scheme'] = $data['scheme'] ?? 'primary';
		$data['font']   = $data['font'] ?? 'system';
		if ( ( 'template' !== $data['scheme'] && null === self::find_choice( SetupChoices::schemes(), $data['scheme'] ) ) || ( 'template' !== $data['font'] && null === self::find_choice( SetupChoices::fonts(), $data['font'] ) ) || \array_diff( \array_keys( $data ), [ 'preset', 'template', 'scheme', 'font', 'tokens', 'appearance' ] ) ) {
			return null;
		}
		$seed = self::preset_tokens( $data['preset'] );
		if ( null === $seed || TokenDraft::validate( $data['tokens'], $seed, FontLibrary::allowed_stacks() ) ) {
			return null;
		}
		return [
			'preset'     => $data['preset'],
			'template'   => $data['template'] ?? $data['preset'],
			'scheme'     => $data['scheme'],
			'font'       => $data['font'],
			'tokens'     => $data['tokens'],
			'appearance' => $data['appearance'] ?? Appearance::site_mode(),
		];
	}

	/** Find one allowlisted choice by id.
	 *
	 * @param list<array<string, mixed>> $choices Choice records.
	 * @param mixed                      $id Submitted id.
	 * @return array<string, mixed>|null
	 */
	private static function find_choice( array $choices, mixed $id ): ?array {
		if ( ! is_string( $id ) ) {
			return null;
		}
		foreach ( $choices as $choice ) {
			if ( $choice['id'] === $id ) {
				return $choice;
			}
		}
		return null;
	}

	/** Build validated CSS values for theme-only preset thumbnails.
	 *
	 * @param array<string, mixed> $tokens Validated preset token map.
	 * @return string Safe custom properties.
	 */
	private static function mock_style( array $tokens ): string {
		$style = '';
		foreach ( [ 'color-bg', 'color-surface', 'color-text', 'color-muted', 'color-primary', 'color-on-primary' ] as $name ) {
			$value = $tokens[ $name ]['value'] ?? '';
			if ( is_string( $value ) && '' !== $value ) {
				$style .= '--mini-' . substr( $name, 6 ) . ':' . $value . ';';
			}
		}
		return $style;
	}

	/** Translate copy stored in bundled JSON through literal gettext source strings.
	 *
	 * @param string $text English source copy.
	 */
	private static function choice_text( string $text ): string {
		$translations = [
			'Template palette'                     => __( 'Template palette', 'blixis' ),
			'Start from scratch'                   => __( 'Start from scratch', 'blixis' ),
			'Choose a palette for your website. Fine-tune it later in Global Styles.' => __( 'Choose a palette for your website. Fine-tune it later in Global Styles.', 'blixis' ),
			'Choose a system font pairing for your website.' => __( 'Choose a system font pairing for your website.', 'blixis' ),
			'Ocean'                                => __( 'Ocean', 'blixis' ),
			'Deep blues and cool neutrals.'        => __( 'Deep blues and cool neutrals.', 'blixis' ),
			'Forest'                               => __( 'Forest', 'blixis' ),
			'Leaf greens and warm neutrals.'       => __( 'Leaf greens and warm neutrals.', 'blixis' ),
			'Sunset'                               => __( 'Sunset', 'blixis' ),
			'Warm terracotta and amber.'           => __( 'Warm terracotta and amber.', 'blixis' ),
			'Minimal'                              => __( 'Minimal', 'blixis' ),
			'Custom'                               => __( 'Custom', 'blixis' ),
			'Begin with a neutral design and shape it yourself.' => __( 'Begin with a neutral design and shape it yourself.', 'blixis' ),
			'High-contrast monochrome essentials.' => __( 'High-contrast monochrome essentials.', 'blixis' ),
			'Primary'                              => __( 'Primary', 'blixis' ),
			'Nature'                               => __( 'Nature', 'blixis' ),
			'Secondary'                            => __( 'Secondary', 'blixis' ),
			'Neutral'                              => __( 'Neutral', 'blixis' ),
			'Modern'                               => __( 'Modern', 'blixis' ),
			'Fresh'                                => __( 'Fresh', 'blixis' ),
			'Vibrant'                              => __( 'Vibrant', 'blixis' ),
			'System Sans'                          => __( 'System Sans', 'blixis' ),
			'Editorial'                            => __( 'Editorial', 'blixis' ),
			'Technical'                            => __( 'Technical', 'blixis' ),
			'Clean & modern'                       => __( 'Clean & modern', 'blixis' ),
			'Classic & readable'                   => __( 'Classic & readable', 'blixis' ),
			'Compact & precise'                    => __( 'Compact & precise', 'blixis' ),
			'Auto'                                 => __( 'Auto', 'blixis' ),
			'Light'                                => __( 'Light', 'blixis' ),
			'Dark'                                 => __( 'Dark', 'blixis' ),
		];
		return $translations[ $text ] ?? $text;
	}

	/**
	 * Store a bounded draft.
	 *
	 * @param int                  $user_id User ID.
	 * @param array<string, mixed> $draft Draft.
	 */
	private static function save_draft( int $user_id, array $draft ): void {
		$json = wp_json_encode( $draft );
		if ( \is_string( $json ) && \strlen( $json ) <= TokenDraft::MAX_BYTES ) {
			update_user_meta( $user_id, self::DRAFT_META, wp_slash( $json ) ); // Meta storage strips slashes, which would break the JSON escapes.
		}
	}

	/**
	 * Load bundled preset tokens.
	 *
	 * @param string $preset Preset ID.
	 * @return array<string, mixed>|null Tokens.
	 */
	private static function preset_tokens( string $preset ): ?array {
		if ( ! isset( self::PRESETS[ $preset ] ) ) {
			return null;
		}
		$path = get_template_directory() . '/design/' . ( 'custom' === $preset ? 'default-tokens.json' : 'presets/' . $preset . '.json' );
		return TokenDraft::seed( $path, $preset );
	}

	/**
	 * Redirect to a wizard step.
	 *
	 * @param int    $step Step.
	 * @param string $error Fixed error code.
	 */
	private static function redirect_step( int $step, string $error = '' ): never {
		$url = admin_url( 'admin.php?page=blixis-setup&step=' . $step );
		if ( '' !== $error ) {
			$url = add_query_arg( 'error', $error, $url );
		}
		wp_safe_redirect( $url );
		exit;
	}

	/**
	 * Render a nonce-protected entry action.
	 *
	 * @param string $action Action.
	 * @param string $label Label.
	 * @param string $button_class Button class.
	 */
	private static function action_form( string $action, string $label, string $button_class = 'button button-secondary' ): void {
		?>
		<form class="blx-setup-action-form blx-setup-action-form--<?php echo esc_attr( $action ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="<?php echo esc_attr( 'blixis_setup_' . $action ); ?>"><?php wp_nonce_field( self::NONCE_ACTION, 'blixis_setup_nonce_' . $action ); ?><button class="<?php echo esc_attr( $button_class ); ?>" type="submit"><?php echo esc_html( $label ); ?></button></form>
		<?php
	}

	/** Reject unauthorized or non-POST requests. */
	private static function require_post(): void {
		self::require_capability();
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			wp_die( esc_html__( 'Method not allowed.', 'blixis' ), '', [ 'response' => 403 ] );
		}
	}

	/** Enforce theme-management capability. */
	private static function require_capability(): void {
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'You are not allowed to manage theme setup.', 'blixis' ), '', [ 'response' => 403 ] );
		}
	}
}
